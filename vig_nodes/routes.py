from __future__ import annotations
from typing import Any
import os
import sys
import threading
from ..vig.llm.models import dropdown_models, remember_dir, remembered_dir, search_roots
PICK_FOLDER_ROUTE = "/vig/models/pick_folder"
PICK_FOLDER_CONTROL_ROUTE = "/vig/models/pick_folder_control"
_TITLES = {
    "models": "Folder holding your .gguf models",
    "project": "Choose the project folder",
    "skills": "Choose a skill folder",
}
_DIALOG_THREAD = {"id": 0}
_DIALOG_LOCK = threading.Lock()
_BROWSE_FLAGS = 0x0001 | 0x0040
_DIALOG_CLASS = "#32770"
_RAISE_TIMEOUT_S = 20.0
try:
    from aiohttp import web
    from server import PromptServer
except Exception:
    web = None
    PromptServer = None
_REGISTERED = False
def _force_foreground(hwnd) -> None:
    from ..vig import winapi
    user32 = winapi.user32
    user32.SetWindowPos(
        hwnd,
        winapi.HWND_TOPMOST,
        0,
        0,
        0,
        0,
        winapi.SWP_NOMOVE | winapi.SWP_NOSIZE | winapi.SWP_SHOWWINDOW,
    )
    user32.BringWindowToTop(hwnd)
    if not user32.SetForegroundWindow(hwnd):
        user32.FlashWindow(hwnd, True)
def _raise_dialog_when_it_appears(thread_id: int, stop: threading.Event) -> None:
    import time
    from ..vig import winapi
    deadline = time.monotonic() + _RAISE_TIMEOUT_S
    while not stop.is_set() and time.monotonic() < deadline:
        try:
            found = winapi.thread_windows(thread_id, _DIALOG_CLASS)
        except Exception:
            return
        if found:
            try:
                _force_foreground(found[0])
            except Exception:
                pass
            return
        stop.wait(0.05)
def _dialog_windows() -> list:
    thread_id = _DIALOG_THREAD.get("id") or 0
    if not thread_id or sys.platform != "win32":
        return []
    from ..vig import winapi
    try:
        return winapi.thread_windows(thread_id, _DIALOG_CLASS)
    except Exception:
        return []
def control_folder_dialog(action: str) -> tuple[int, dict[str, Any]]:
    windows = _dialog_windows()
    if not windows:
        return 200, {"ok": True, "open": False}
    try:
        if action == "cancel":
            from ..vig import winapi
            for hwnd in windows:
                winapi.user32.PostMessageW(hwnd, winapi.WM_CLOSE, 0, 0)
        else:
            _force_foreground(windows[0])
    except Exception as exc:
        return 500, {"ok": False, "open": True, "message": f"{type(exc).__name__}: {exc}"}
    return 200, {"ok": True, "open": True, "done": action}
def _open_windows_dialog(title: str, start: str) -> str | None:
    from ..vig import winapi
    owns_com = winapi.com_init()
    _DIALOG_THREAD["id"] = _current_thread_id()
    owner = 0
    stop = threading.Event()
    watcher = threading.Thread(
        target=_raise_dialog_when_it_appears,
        args=(_current_thread_id(), stop),
        daemon=True,
        name="vig-folder-dialog-raiser",
    )
    try:
        owner = winapi.topmost_owner()
    except Exception:
        owner = 0
    watcher.start()
    try:
        try:
            return _modern_folder_dialog(int(owner or 0), title, start)
        except Exception as modern:
            try:
                from win32com.client import Dispatch
            except ImportError:
                raise modern from None
            legacy = Dispatch("Shell.Application")
            chosen = legacy.BrowseForFolder(int(owner or 0), title, _BROWSE_FLAGS, start or "")
            if chosen is None:
                return None
            return str(chosen.Self.Path)
    finally:
        stop.set()
        watcher.join(timeout=1.0)
        _DIALOG_THREAD["id"] = 0
        if owner:
            try:
                winapi.user32.DestroyWindow(owner)
            except Exception:
                pass
        if owns_com:
            winapi.com_done()
def _modern_folder_dialog(owner: int, title: str, start: str) -> str | None:
    import ctypes
    from ctypes import wintypes
    ole32 = ctypes.oledll.ole32
    class _GUID(ctypes.Structure):
        _fields_ = [
            ("d1", ctypes.c_ulong),
            ("d2", ctypes.c_ushort),
            ("d3", ctypes.c_ushort),
            ("d4", ctypes.c_ubyte * 8),
        ]
    def _guid(text: str) -> _GUID:
        out = _GUID()
        ole32.CLSIDFromString(text, ctypes.byref(out))
        return out
    clsid_dialog = _guid("{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}")
    iid_dialog = _guid("{D57C7288-D4AD-4768-BE02-9D969532D960}")
    iid_shell_item = _guid("{43826D1E-E718-42EE-BC55-A1E261C37BFE}")
    def _method(ptr, index, restype, *argtypes):
        vtable = ctypes.cast(ptr, ctypes.POINTER(ctypes.c_void_p)).contents.value
        entry = ctypes.cast(vtable, ctypes.POINTER(ctypes.c_void_p))[index]
        prototype = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)
        bound = prototype(entry)
        return lambda *args: bound(ptr, *args)
    def _release(ptr):
        if ptr:
            _method(ptr, 2, ctypes.c_ulong)()
    dialog = ctypes.c_void_p()
    ole32.CoCreateInstance(
        ctypes.byref(clsid_dialog),
        None,
        1,
        ctypes.byref(iid_dialog),
        ctypes.byref(dialog),
    )
    try:
        options = wintypes.DWORD()
        _method(dialog, 10, ctypes.HRESULT, ctypes.POINTER(wintypes.DWORD))(
            ctypes.byref(options)
        )
        picker = 0x20 | 0x40 | 0x800
        _method(dialog, 9, ctypes.HRESULT, wintypes.DWORD)(options.value | picker)
        _method(dialog, 17, ctypes.HRESULT, wintypes.LPCWSTR)(title)
        if start and os.path.isdir(start):
            item = ctypes.c_void_p()
            try:
                ctypes.oledll.shell32.SHCreateItemFromParsingName(
                    os.path.abspath(start), None, ctypes.byref(iid_shell_item), ctypes.byref(item)
                )
                _method(dialog, 12, ctypes.HRESULT, ctypes.c_void_p)(item)
            except OSError:
                pass
            finally:
                _release(item)
        show = _method(dialog, 3, ctypes.c_long, wintypes.HWND)
        result_code = show(owner or None) & 0xFFFFFFFF
        if result_code == 0x800704C7:
            return None
        if result_code & 0x80000000:
            raise OSError(f"IFileOpenDialog.Show failed: 0x{result_code:08X}")
        item = ctypes.c_void_p()
        _method(dialog, 20, ctypes.HRESULT, ctypes.POINTER(ctypes.c_void_p))(
            ctypes.byref(item)
        )
        try:
            path_ptr = ctypes.c_wchar_p()
            _method(item, 5, ctypes.HRESULT, ctypes.c_ulong, ctypes.POINTER(ctypes.c_wchar_p))(
                0x80058000, ctypes.byref(path_ptr)
            )
            path = path_ptr.value
            ctypes.windll.ole32.CoTaskMemFree(path_ptr)
            return path
        finally:
            _release(item)
    finally:
        _release(dialog)
def _current_thread_id() -> int:
    from ..vig import winapi
    return winapi.thread_id()
def pick_folder(start: str = "", opener=None, purpose: str = "models") -> tuple[int, dict[str, Any]]:
    if opener is None:
        if sys.platform != "win32":
            return 501, {
                "ok": False,
                "message": (
                    "The folder dialog is only wired for Windows here. "
                    "Type or paste the path instead."
                ),
            }
        opener = _open_windows_dialog
    purpose = purpose if purpose in _TITLES else "models"
    where = (start or "").strip().strip('"')
    if not where or not os.path.isdir(where):
        where = remembered_dir() if purpose == "models" else ""
    if not _DIALOG_LOCK.acquire(blocking=False):
        control_folder_dialog("raise")
        return 409, {
            "ok": False,
            "busy": True,
            "message": "The folder dialog is already open — it was brought to the front.",
        }
    try:
        chosen = opener(_TITLES[purpose], where or "")
    except Exception as exc:
        return 500, {
            "ok": False,
            "message": (
                f"Could not open the folder dialog ({type(exc).__name__}: {exc}). "
                "Type or paste the path instead."
            ),
        }
    finally:
        _DIALOG_LOCK.release()
    if not chosen:
        return 200, {"ok": True, "cancelled": True, "path": ""}
    path = os.path.abspath(str(chosen))
    if not os.path.isdir(path):
        return 400, {"ok": False, "message": f"{path!r} is not a folder."}
    if purpose != "models":
        return 200, {"ok": True, "cancelled": False, "path": path}
    return 200, {"ok": True, "cancelled": False, "path": path, **gguf_models(path)[1]}
def gguf_models(extra_dir: str = "") -> tuple[int, dict[str, Any]]:
    directory = (extra_dir or "").strip().strip('"')
    remember_dir(directory)
    return 200, {
        "ok": True,
        "models": dropdown_models(directory),
        "roots": search_roots(directory),
    }
def register_routes() -> bool:
    global _REGISTERED
    if _REGISTERED:
        return True
    routes = getattr(getattr(PromptServer, "instance", None), "routes", None)
    if routes is None or web is None:
        return False
    import asyncio
    @routes.post(PICK_FOLDER_ROUTE)
    async def vig_pick_folder(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        start = str((payload or {}).get("start") or "")
        purpose = str((payload or {}).get("purpose") or "models")
        status, body = await asyncio.to_thread(pick_folder, start, None, purpose)
        return web.json_response(body, status=status)
    @routes.post(PICK_FOLDER_CONTROL_ROUTE)
    async def vig_pick_folder_control(request):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        action = str((payload or {}).get("action") or "raise")
        status, body = await asyncio.to_thread(control_folder_dialog, action)
        return web.json_response(body, status=status)
    _REGISTERED = True
    return True
try:
    register_routes()
except Exception as exc:
    print(f"[VIG MiniMax H3 Director] panel routes unavailable: {exc}")
NODES: dict = {}
