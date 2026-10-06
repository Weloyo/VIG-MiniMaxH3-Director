from __future__ import annotations
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Iterator, Optional, Sequence
SAGE_RELEASES = "https://api.github.com/repos/woct0rdho/SageAttention/releases?per_page=20"
TRITON_PYPI = "https://pypi.org/pypi/triton-windows/json"
INCLUDE_LIBS_BASE = (
    "https://github.com/woct0rdho/triton-windows/releases/download/v3.0.0-windows.post1/"
)
INCLUDE_LIBS_ASSET = {
    (3, 9): "python_3.9.13_include_libs.zip",
    (3, 10): "python_3.10.11_include_libs.zip",
    (3, 11): "python_3.11.9_include_libs.zip",
    (3, 12): "python_3.12.7_include_libs.zip",
    (3, 13): "python_3.13.2_include_libs.zip",
}
TRITON_FOR_TORCH = {
    (2, 4): (3, 1),
    (2, 5): (3, 1),
    (2, 6): (3, 2),
    (2, 7): (3, 3),
    (2, 8): (3, 4),
    (2, 9): (3, 5),
    (2, 10): (3, 6),
}
WELL_KNOWN_ROOTS = (
    r"D:\ComfyUI_windows_portable",
    r"C:\ComfyUI_windows_portable",
    r"E:\ComfyUI_windows_portable",
)
USER_AGENT = "install_sageattention (VIG MiniMax H3 Director)"
ASSET_RE = re.compile(
    r"^sageattention-(?P<ver>\d+(?:\.\d+)*)"
    r"\+cu(?P<cu>\d{3,4})torch(?P<torch>\d+(?:\.\d+)*)(?P<andhigher>andhigher)?"
    r"(?:\.post(?P<post>\d+))?"
    r"-cp(?P<cp>\d{2,3})-abi3-win_amd64\.whl$"
)
PROBE = r"""
import json, sys
info = {"python": list(sys.version_info[:3]), "prefix": sys.prefix, "base": sys.base_prefix}
try:
    import torch
    info["torch"] = torch.__version__
    info["cuda"] = torch.version.cuda
    if torch.cuda.is_available():
        info["gpu"] = torch.cuda.get_device_name(0)
        info["capability"] = list(torch.cuda.get_device_capability(0))
except Exception as exc:
    info["torch_error"] = "%s: %s" % (type(exc).__name__, exc)
for module, dist in (("triton", "triton-windows"), ("sageattention", "sageattention")):
    # Import first -- a leftover dist-info without the package would otherwise
    # report a version for something that cannot be loaded. Then prefer the
    # distribution version, because it carries the +cuXXXtorchX.Y tag that says
    # which build this actually is; __version__ drops it.
    try:
        loaded = __import__(module)
    except Exception:
        info[module] = None
        continue
    try:
        import importlib.metadata
        info[module] = importlib.metadata.version(dist)
    except Exception:
        info[module] = getattr(loaded, "__version__", "installed")
print(json.dumps(info))
"""
VERIFY = r"""
import sys, torch
from sageattention import sageattn
if not torch.cuda.is_available():
    print("no CUDA device visible, kernel test skipped")
    sys.exit(0)
torch.manual_seed(0)
q, k, v = (torch.randn(1, 1024, 8, 128, dtype=torch.float16, device="cuda") for _ in range(3))
out = sageattn(q, k, v, is_causal=False, tensor_layout="NHD")
torch.cuda.synchronize()
ref = torch.nn.functional.scaled_dot_product_attention(
    q.transpose(1, 2).float(), k.transpose(1, 2).float(), v.transpose(1, 2).float()
).transpose(1, 2).half()
diff = (out - ref).abs().max().item()
print("ran on %s, max abs diff vs sdpa %.4f" % (torch.cuda.get_device_name(0), diff))
sys.exit(0 if diff < 0.05 else 3)
"""
class Failure(Exception):
    pass
def step(text: str) -> None:
    print("\n==> " + text, flush=True)
def say(text: str) -> None:
    print("    " + text, flush=True)
def parse_version(text: str) -> tuple:
    parts = []
    for chunk in re.split(r"[+\-]", text)[0].split("."):
        match = re.match(r"\d+", chunk)
        if not match:
            break
        parts.append(int(match.group()))
    return tuple(parts)
def pypi_sort_key(version: str) -> tuple:
    base = (parse_version(version) + (0, 0, 0))[:3]
    post = re.search(r"\.post(\d+)", version)
    return base + (int(post.group(1)) if post else 0,)
def expected_triton(torch_version: tuple) -> Optional[tuple]:
    key = torch_version[:2]
    if key in TRITON_FOR_TORCH:
        return TRITON_FOR_TORCH[key]
    if len(key) == 2 and key[0] == 2 and key[1] > 10:
        return (3, key[1] - 4)
    return None
def http_get(url: str, attempts: int = 3) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    token = os.environ.get("GITHUB_TOKEN")
    if token and "api.github.com" in url:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, headers=headers)
    for attempt in range(1, attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 429) and "api.github.com" in url:
                raise Failure(
                    "GitHub refused the request (%s). The unauthenticated API allows 60 "
                    "calls an hour per address; wait it out, set GITHUB_TOKEN, or pass "
                    "the wheel yourself with --wheel-url." % exc.code
                ) from exc
            raise Failure("%s returned HTTP %s" % (url, exc.code)) from exc
        except (urllib.error.URLError, OSError) as exc:
            reason = getattr(exc, "reason", exc)
            if attempt == attempts:
                raise Failure("could not reach %s: %s" % (url, reason)) from exc
            say("%s (attempt %d of %d, retrying)" % (reason, attempt, attempts))
            time.sleep(2 * attempt)
    raise Failure("could not reach %s" % url)
def download(url: str, target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(http_get(url))
    return target
VENV_PYTHONS = (".venv/Scripts/python.exe", "venv/Scripts/python.exe")
def as_interpreter(path: Path) -> Optional[Path]:
    if path.is_file():
        return path
    for suffix in ("python.exe", "python_embeded/python.exe", "../python_embeded/python.exe",
                   "Scripts/python.exe") + VENV_PYTHONS:
        candidate = path / suffix
        if candidate.is_file():
            return candidate.resolve()
    return None
def candidates(explicit: Optional[str]) -> Iterator[Path]:
    if explicit:
        yield Path(explicit)
        return
    here = Path(__file__)
    for anchor in (here.absolute(), here.resolve()):
        for parent in anchor.parents:
            if (parent / "main.py").is_file() and (parent / "comfy").is_dir():
                for venv in VENV_PYTHONS:
                    yield parent / venv
                yield parent.parent / "python_embeded" / "python.exe"
            yield parent / "python_embeded" / "python.exe"
    yield Path.cwd() / "python_embeded" / "python.exe"
    for root in WELL_KNOWN_ROOTS:
        yield Path(root) / "python_embeded" / "python.exe"
    yield Path(sys.executable)
def find_python(explicit: Optional[str]) -> Path:
    seen = set()
    for candidate in candidates(explicit):
        if candidate in seen:
            continue
        seen.add(candidate)
        interpreter = as_interpreter(candidate)
        if interpreter:
            return interpreter
    if explicit:
        raise Failure("no python.exe under %s" % explicit)
    raise Failure(
        "no ComfyUI interpreter found. Pass the ComfyUI folder or its Python itself, "
        "e.g. D:\\ComfyUI_windows_portable or ...\\ComfyUI\\.venv\\Scripts\\python.exe"
    )
def probe(python: Path) -> dict:
    result = subprocess.run(
        [str(python), "-c", PROBE], capture_output=True, text=True, timeout=600
    )
    if result.returncode != 0:
        raise Failure("could not run %s:\n%s" % (python, result.stderr.strip()))
    try:
        return json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError) as exc:
        raise Failure("unexpected output from %s:\n%s" % (python, result.stdout)) from exc
def pick_triton(torch_version: tuple, py_minor: int) -> str:
    wanted = expected_triton(torch_version)
    if wanted:
        say("torch %s expects Triton %s"
            % (".".join(map(str, torch_version)), ".".join(map(str, wanted))))
    data = json.loads(http_get(TRITON_PYPI))
    tag = "cp3%d" % py_minor
    usable = []
    for version, files in data.get("releases", {}).items():
        if re.search(r"\d+(a|b|rc)\d", version):
            continue
        parsed = parse_version(version)
        if len(parsed) < 2 or (wanted and parsed[:2] > wanted):
            continue
        if not any(
            not f.get("yanked") and tag in f["filename"] and "win_amd64" in f["filename"]
            for f in files
        ):
            continue
        usable.append(version)
    if not usable:
        raise Failure(
            "no triton-windows release has a %s win_amd64 wheel at or below %s"
            % (tag, ".".join(map(str, wanted)) if wanted else "any version")
        )
    return max(usable, key=pypi_sort_key)
def rank_asset(match, torch_version: tuple, cuda: tuple, py_minor: int):
    cu_text = match.group("cu")
    cu = (int(cu_text[:-1]), int(cu_text[-1]))
    if cu[0] != cuda[0] or cu[1] > cuda[1]:
        return None
    if int(match.group("cp")[1:]) > py_minor:
        return None
    base = parse_version(match.group("torch"))
    if match.group("andhigher"):
        if torch_version < base:
            return None
    elif torch_version[: len(base)] != base:
        return None
    return (cu[1], base, int(match.group("post") or 0))
def pick_sage_wheel(torch_version: tuple, cuda: tuple, py_minor: int) -> str:
    releases = json.loads(http_get(SAGE_RELEASES))
    saw_wheels = False
    for release in releases:
        if "windows" not in release.get("tag_name", "").lower():
            continue
        best = None
        for asset in release.get("assets", []):
            name = urllib.parse.unquote(asset["name"])
            match = ASSET_RE.match(name)
            if not match:
                continue
            saw_wheels = True
            key = rank_asset(match, torch_version, cuda, py_minor)
            if key is not None and (best is None or key > best[0]):
                best = (key, asset["browser_download_url"])
        if best:
            say("from release %s" % release["tag_name"])
            return best[1]
    detail = (
        "none of them match cu%d%d + torch %s + cp3%d"
        % (cuda[0], cuda[1], ".".join(map(str, torch_version)), py_minor)
        if saw_wheels
        else "no win_amd64 wheels in the recent releases"
    )
    raise Failure(
        "no usable SageAttention wheel: %s. Look through the releases by hand and pass "
        "--wheel-url:\n    https://github.com/woct0rdho/SageAttention/releases" % detail
    )
def pip_install(python: Path, target: str, dry_run: bool, force: bool = False) -> None:
    command = [str(python), "-m", "pip", "install", "--no-deps", "--upgrade"]
    if force:
        command.append("--force-reinstall")
    command.append(target)
    if dry_run:
        say("would run: " + " ".join(command))
        return
    if subprocess.run(command).returncode != 0:
        raise Failure("pip failed on %s" % target)
def ensure_headers(python: Path, py_version: Sequence[int], dry_run: bool,
                   base: Optional[str] = None) -> None:
    root = Path(base) if base else python.parent
    minor = (int(py_version[0]), int(py_version[1]))
    header = root / "Include" / "Python.h"
    library = root / "libs" / ("python%d%d.lib" % minor)
    if header.exists() and library.exists():
        say("headers and import library already in place")
        return
    asset = INCLUDE_LIBS_ASSET.get(minor)
    if not asset:
        say(
            "no include/libs package published for Python %d.%d -- the CUDA kernels will "
            "still work, Triton will fail to build any kernel of its own" % minor
        )
        return
    if dry_run:
        say("would unpack %s into %s" % (asset, root))
        return
    archive = download(INCLUDE_LIBS_BASE + asset, root / ("." + asset))
    added = skipped = 0
    try:
        with zipfile.ZipFile(archive) as bundle:
            for name in bundle.namelist():
                if name.endswith("/"):
                    continue
                destination = root / name.replace("/", os.sep)
                if destination.exists():
                    skipped += 1
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(name) as source, open(destination, "wb") as sink:
                    shutil.copyfileobj(source, sink)
                added += 1
    finally:
        try:
            archive.unlink()
        except OSError:
            pass
    say("unpacked %s: %d files added, %d already there" % (asset, added, skipped))
def verify(python: Path) -> bool:
    result = subprocess.run(
        [str(python), "-c", VERIFY], capture_output=True, text=True, timeout=1800
    )
    for line in (result.stdout + result.stderr).strip().splitlines()[-6:]:
        say(line)
    return result.returncode == 0
def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Install SageAttention and Triton into ComfyUI's Python "
        "(portable, ComfyUI Desktop or a venv)."
    )
    parser.add_argument(
        "target",
        nargs="?",
        help="ComfyUI portable folder, a ComfyUI folder with a .venv, or a python.exe. "
        "Found automatically when omitted.",
    )
    parser.add_argument("--python", dest="python", help="same as the positional argument")
    parser.add_argument("--dry-run", action="store_true", help="report the plan, change nothing")
    parser.add_argument("--force", action="store_true", help="reinstall even if already present")
    parser.add_argument("--wheel-url", help="use this SageAttention wheel instead of choosing one")
    parser.add_argument("--skip-headers", action="store_true", help="leave Include/ and libs/ alone")
    parser.add_argument("--no-verify", action="store_true", help="skip the GPU check at the end")
    args = parser.parse_args(argv)
    if os.name != "nt":
        print("These are win_amd64 wheels; this script only makes sense on Windows.")
        return 1
    step("Finding the interpreter")
    python = find_python(args.python or args.target)
    say(str(python))
    step("Probing")
    info = probe(python)
    if "torch_error" in info:
        raise Failure(
            "torch is not importable there (%s), so there is nothing to match against. "
            "Point the script at ComfyUI's own Python (python_embeded, or the .venv of "
            "ComfyUI Desktop)." % info["torch_error"]
        )
    py_version = info["python"]
    py_minor = int(py_version[1])
    torch_version = parse_version(info["torch"])
    if not info.get("cuda"):
        raise Failure(
            "that torch build has no CUDA (%s), so SageAttention has nothing to bind to. "
            "Install a cu12x/cu13x torch first." % info["torch"]
        )
    cuda = parse_version(info["cuda"])
    say("Python %s" % ".".join(map(str, py_version)))
    say("torch %s (CUDA %s)" % (info["torch"], info["cuda"]))
    if info.get("gpu"):
        say("%s, compute capability %s" % (info["gpu"], ".".join(map(str, info["capability"]))))
        if tuple(info["capability"]) < (8, 0):
            say("note: SageAttention wants sm_80 or newer, this card is below that")
    else:
        say("no GPU visible right now, installing anyway")
    say("present: triton=%s sageattention=%s" % (info.get("triton"), info.get("sageattention")))
    step("Triton")
    if info.get("triton") and not args.force:
        say("already installed (%s), left alone; --force to replace" % info["triton"])
    else:
        version = pick_triton(torch_version, py_minor)
        say("chosen: triton-windows %s" % version)
        pip_install(python, "triton-windows==%s" % version, args.dry_run, args.force)
    step("SageAttention")
    if info.get("sageattention") and not args.force:
        say("already installed (%s), left alone; --force to replace" % info["sageattention"])
    else:
        url = args.wheel_url or pick_sage_wheel(torch_version, cuda, py_minor)
        say("chosen: %s" % urllib.parse.unquote(url.rsplit("/", 1)[-1]))
        pip_install(python, url, args.dry_run, args.force)
    step("Python headers for Triton")
    if args.skip_headers:
        say("skipped")
    else:
        ensure_headers(python, py_version, args.dry_run, info.get("base"))
    if args.dry_run:
        step("Dry run, nothing was changed")
        return 0
    if args.no_verify:
        step("Done -- restart ComfyUI")
        return 0
    step("Checking the kernels on the GPU")
    if not verify(python):
        say("")
        say("that failed. If SageAttention was already installed it is probably a build")
        say("for a different CUDA or torch; run again with --force.")
        return 1
    step("Done -- restart ComfyUI, then set the KJNodes node to 'auto' "
         "('sageattn3' is for RTX 50xx cards only)")
    return 0
if __name__ == "__main__":
    try:
        sys.exit(main())
    except Failure as error:
        print("\nERROR: %s" % error, file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
