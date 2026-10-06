from __future__ import annotations
import atexit
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from . import hostmem
from .base import BackendError
from .openai_client import OpenAIClientBackend, list_models
BINARY_NAMES = ("llama-server", "llama-server.exe", "server", "server.exe")
BINARY_SUBDIRS = ("llama.cpp", "llama-cpp", "bin")
READY_TIMEOUT = 120.0
STOP_GRACE = 5.0
LOG_TAIL_CHARS = 800
@dataclass
class ServerSettings:
    model_path: str
    binary: str = ""
    host: str = "127.0.0.1"
    port: int = 0
    n_ctx: int = 16384
    n_gpu_layers: int = -1
    n_threads: int = 0
    extra_args: tuple[str, ...] = ()
    ready_timeout: float = READY_TIMEOUT
    mmproj_path: str = ""
    model_size_bytes: int = 0
    tool_calls: bool = False
    evict_comfy_models: bool = True
    launcher: object = None
    prober: object = None
def comfy_model_bases() -> list[str]:
    from .. import paths
    return paths.model_bases()
def first_error(log: str) -> str:
    for line in log.splitlines():
        head, marker, rest = line.partition(" E ")
        if marker and head.strip().replace(".", "").isdigit():
            return rest.split(": ", 1)[-1].strip()
    return ""
def _free_port(host: str) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])
NEAR_MODEL_LEVELS = 3
def find_binary(extra_dir: str = "", near: str = "") -> str:
    roots: list[Path] = []
    if near:
        folder = Path(near).parent
        for _ in range(NEAR_MODEL_LEVELS + 1):
            roots.append(folder)
            if folder.parent == folder:
                break
            folder = folder.parent
    if extra_dir:
        roots.append(Path(extra_dir))
    try:
        from .models import comfy_models_dir, search_roots
        roots.extend(Path(root) for root in search_roots(extra_dir))
        models_dir = comfy_models_dir()
        if models_dir:
            roots.append(Path(models_dir))
        roots.extend(Path(base) for base in comfy_model_bases())
    except Exception:
        pass
    seen: set[str] = set()
    for root in roots:
        for folder in (root, *(root / sub for sub in BINARY_SUBDIRS)):
            key = str(folder).lower()
            if key in seen:
                continue
            seen.add(key)
            for name in BINARY_NAMES:
                candidate = folder / name
                if candidate.is_file():
                    return str(candidate)
    for name in BINARY_NAMES:
        found = shutil.which(name)
        if found:
            return found
    return ""
def _python_server_command() -> list[str]:
    import importlib.util
    if importlib.util.find_spec("llama_cpp") is None:
        return []
    for extra in (
        "uvicorn",
        "sse_starlette",
        "fastapi",
        "pydantic_settings",
        "starlette_context",
    ):
        if importlib.util.find_spec(extra) is None:
            return []
    return [sys.executable, "-m", "llama_cpp.server"]
def resolve_runner(settings: ServerSettings) -> tuple[list[str], str]:
    binary = settings.binary or find_binary(near=settings.model_path)
    if binary:
        if not Path(binary).is_file():
            raise BackendError(
                f"llama.cpp server binary {binary!r} does not exist. Point the setting at the "
                "executable, or clear it to search the model folders."
            )
        return [binary], "llama-server"
    python_server = _python_server_command()
    if python_server:
        return python_server, "llama_cpp.server"
    raise BackendError(
        "No local server to run. Put a llama.cpp release (llama-server) in one of ComfyUI's "
        f"model folders -- a {BINARY_SUBDIRS[0]!r} subfolder is enough -- or install the "
        "server extras with: pip install \"llama-cpp-python[server]\". Until then, point the "
        "backend at a server you run yourself."
    )
def _gpu_layers_for(runner: str, n_gpu_layers: int) -> str:
    value = int(n_gpu_layers)
    if runner == "llama-server" and value < 0:
        return "all"
    return str(value)
def _argv(command: list[str], runner: str, settings: ServerSettings, port: int) -> list[str]:
    argv = [*command]
    if runner == "llama-server":
        argv += [
            "--model", settings.model_path,
            "--host", settings.host,
            "--port", str(port),
            "--ctx-size", str(int(settings.n_ctx)),
            "--n-gpu-layers", _gpu_layers_for(runner, settings.n_gpu_layers),
        ]
        if settings.n_threads > 0:
            argv += ["--threads", str(int(settings.n_threads))]
        if settings.mmproj_path:
            argv += ["--mmproj", settings.mmproj_path]
        if settings.tool_calls:
            argv += ["--jinja"]
    else:
        argv += [
            "--model", settings.model_path,
            "--host", settings.host,
            "--port", str(port),
            "--n_ctx", str(int(settings.n_ctx)),
            "--n_gpu_layers", _gpu_layers_for(runner, settings.n_gpu_layers),
        ]
        if settings.n_threads > 0:
            argv += ["--n_threads", str(int(settings.n_threads))]
        if settings.mmproj_path:
            argv += ["--clip_model_path", settings.mmproj_path]
        if settings.tool_calls:
            argv += ["--chat_format", "chatml-function-calling"]
    argv += [str(arg) for arg in settings.extra_args]
    return argv
def _popen_kwargs(log) -> dict:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    for steering in ("PORT", "HOST", "MODEL", "N_CTX", "N_GPU_LAYERS", "N_THREADS"):
        env.pop(steering, None)
    kwargs: dict = {
        "stdout": log,
        "stderr": subprocess.STDOUT,
        "stdin": subprocess.DEVNULL,
        "env": env,
    }
    if os.name == "nt":
        kwargs["creationflags"] = (
            getattr(subprocess, "CREATE_NO_WINDOW", 0)
            | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        )
    else:
        kwargs["start_new_session"] = True
    return kwargs
class LlamaServer:
    def __init__(self, settings: ServerSettings) -> None:
        self.settings = settings
        self.process = None
        self.port = 0
        self.runner = ""
        self.notes: list[str] = []
        self._log_path: Path | None = None
        self._log = None
        self._lock = threading.Lock()
        self._stopped = False
    @property
    def base_url(self) -> str:
        return f"http://{self.settings.host}:{self.port}/v1"
    def log_tail(self) -> str:
        if self._log_path is None or not self._log_path.is_file():
            return ""
        try:
            text = self._log_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        return text[-LOG_TAIL_CHARS:].strip()
    def make_room(self) -> None:
        size = self._size_bytes()
        if int(self.settings.n_gpu_layers) == 0:
            hostmem.reserve_host_ram(size)
            self._require_host_room(size)
            return
        if not self.settings.evict_comfy_models:
            self._require_room(size, hostmem.free_vram_bytes())
            return
        before = hostmem.free_vram_bytes()
        hostmem.free_comfy_vram()
        after = hostmem.free_vram_bytes()
        if before is not None and after is not None and after - before > (1 << 28):
            self.notes.append(
                f"Freed {(after - before) / (1 << 30):.1f} GiB of VRAM from ComfyUI's models "
                f"before starting the writing server; {after / (1 << 30):.1f} GiB free."
            )
        self._require_room(size, after)
    def _size_bytes(self) -> int:
        if self.settings.model_size_bytes > 0:
            return int(self.settings.model_size_bytes)
        try:
            return int(Path(self.settings.model_path).stat().st_size)
        except OSError:
            return 0
    def _require_room(self, size: int, free: int | None) -> None:
        if size <= 0 or free is None:
            return
        needed = hostmem.vram_needed(size)
        if needed <= free:
            return
        host = hostmem.free_ram_bytes()
        card = (
            f"the card ({free / (1 << 30):.1f} GiB free of the "
            f"{needed / (1 << 30):.1f} it needs)"
        )
        if host is not None and hostmem.host_needed(size) > host:
            raise BackendError(
                f"{Path(self.settings.model_path).name} is {size / (1 << 30):.1f} GiB and fits "
                f"neither {card} nor system RAM ({host / (1 << 30):.1f} GiB free). Choose a "
                "smaller writing model, or free memory before the run."
            )
        self.notes.append(
            f"WARNING: the writing model does not fit {card}, so the server was started on "
            "the CPU instead -- several times slower to write with, but it finishes."
        )
        self.settings.n_gpu_layers = 0
        hostmem.reserve_host_ram(size)
    def _require_host_room(self, size: int) -> None:
        host = hostmem.free_ram_bytes()
        if size <= 0 or host is None:
            return
        needed = hostmem.host_needed(size)
        if needed <= host:
            return
        raise BackendError(
            f"{Path(self.settings.model_path).name} is {size / (1 << 30):.1f} GiB and does not "
            f"fit system RAM ({host / (1 << 30):.1f} GiB free, needs "
            f"{needed / (1 << 30):.1f}). Choose a smaller writing model, or free memory "
            "before the run."
        )
    def start(self) -> str:
        model = Path(self.settings.model_path)
        if not self.settings.model_path or not model.is_file():
            raise BackendError(
                f"no model file at {self.settings.model_path!r}. Put a .gguf in ComfyUI's "
                "models folder and choose it on the node."
            )
        command, self.runner = resolve_runner(self.settings)
        self.make_room()
        self.port = int(self.settings.port) or _free_port(self.settings.host)
        argv = _argv(command, self.runner, self.settings, self.port)
        handle, path = tempfile.mkstemp(prefix="vig-llama-server-", suffix=".log")
        os.close(handle)
        self._log_path = Path(path)
        self._log = self._log_path.open("w", encoding="utf-8", errors="replace")
        launcher = self.settings.launcher or subprocess.Popen
        try:
            self.process = launcher(argv, **_popen_kwargs(self._log))
        except OSError as exc:
            self._close_log()
            raise BackendError(f"could not start {argv[0]!r}: {exc}") from exc
        atexit.register(self.stop)
        try:
            self._wait_ready()
        except BackendError:
            self.stop()
            raise
        return self.base_url
    def _wait_ready(self) -> None:
        prober = self.settings.prober or _http_ready
        deadline = time.monotonic() + float(self.settings.ready_timeout)
        while time.monotonic() < deadline:
            code = self.poll()
            if code is not None:
                tail = self.log_tail()
                cause = first_error(tail)
                raise BackendError(
                    f"the local server exited with code {code} before it was ready"
                    + (f": {cause}" if cause else ".")
                    + (f" It said:\n{tail}" if tail else "")
                )
            if prober(self.base_url):
                return
            time.sleep(0.25)
        tail = self.log_tail()
        raise BackendError(
            f"the local server did not answer within {self.settings.ready_timeout:.0f}s. "
            "A large model on a small card can take longer -- raise the timeout -- or the "
            "model may not be loadable at all."
            + (f" It said:\n{tail}" if tail else "")
        )
    def poll(self):
        return self.process.poll() if self.process is not None else None
    def stop(self) -> None:
        with self._lock:
            if self._stopped:
                return
            self._stopped = True
        process, self.process = self.process, None
        if process is not None and process.poll() is None:
            try:
                process.terminate()
                try:
                    process.wait(timeout=STOP_GRACE)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=STOP_GRACE)
            except Exception:
                pass
        self._close_log()
        try:
            atexit.unregister(self.stop)
        except Exception:
            pass
    def _close_log(self) -> None:
        if self._log is not None:
            try:
                self._log.close()
            except Exception:
                pass
            self._log = None
        if self._log_path is not None:
            try:
                self._log_path.unlink()
            except OSError:
                pass
            self._log_path = None
    def __enter__(self) -> LlamaServer:
        self.start()
        return self
    def __exit__(self, *_exc) -> None:
        self.stop()
def _http_ready(base_url: str) -> bool:
    import requests
    try:
        response = requests.get(f"{base_url}/models", timeout=2)
    except Exception:
        return False
    return response.status_code < 500
class ManagedServerBackend(OpenAIClientBackend):
    name = "local-server"
    def __init__(self, server_settings: ServerSettings, **client_options) -> None:
        self.server = LlamaServer(server_settings)
        base_url = self.server.start()
        try:
            client_options.setdefault("model", Path(server_settings.model_path).stem)
            super().__init__(base_url=base_url, **client_options)
        except BaseException:
            self.server.stop()
            raise
        self.notes = list(self.server.notes)
        try:
            served = list_models(base_url, timeout=self.timeout)
        except Exception:
            served = []
        if len(served) == 1:
            self.model = served[0]
    def release(self) -> None:
        self.server.stop()
    def close(self) -> None:
        self.release()
