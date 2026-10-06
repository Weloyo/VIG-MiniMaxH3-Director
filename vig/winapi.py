from __future__ import annotations
import ctypes
import sys
from ctypes import wintypes
HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOACTIVATE = 0x0010
SWP_SHOWWINDOW = 0x0040
WS_EX_TOPMOST = 0x00000008
WS_EX_TOOLWINDOW = 0x00000080
WM_CLOSE = 0x0010
COINIT_APARTMENTTHREADED = 0x2
if sys.platform == "win32":
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    ole32 = ctypes.WinDLL("ole32")
    _ENUM_PROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                                    ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user32.SetWindowPos.restype = wintypes.BOOL
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.restype = wintypes.BOOL
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.FlashWindow.argtypes = [wintypes.HWND, wintypes.BOOL]
    user32.FlashWindow.restype = wintypes.BOOL
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.restype = ctypes.c_int
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.EnumThreadWindows.argtypes = [wintypes.DWORD, _ENUM_PROC, wintypes.LPARAM]
    user32.EnumThreadWindows.restype = wintypes.BOOL
    user32.EnumWindows.argtypes = [_ENUM_PROC, wintypes.LPARAM]
    user32.EnumWindows.restype = wintypes.BOOL
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.PostMessageW.restype = wintypes.BOOL
    user32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR,
                                       wintypes.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                       ctypes.c_int, wintypes.HWND, wintypes.HMENU,
                                       wintypes.HINSTANCE, wintypes.LPVOID]
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.DestroyWindow.argtypes = [wintypes.HWND]
    user32.DestroyWindow.restype = wintypes.BOOL
    kernel32.GetCurrentThreadId.argtypes = []
    kernel32.GetCurrentThreadId.restype = wintypes.DWORD
    ole32.CoInitializeEx.argtypes = [wintypes.LPVOID, wintypes.DWORD]
    ole32.CoInitializeEx.restype = ctypes.c_long
    ole32.CoUninitialize.argtypes = []
    ole32.CoUninitialize.restype = None
else:
    user32 = kernel32 = ole32 = None
    _ENUM_PROC = None
def thread_id() -> int:
    return int(kernel32.GetCurrentThreadId())
def com_init() -> bool:
    return ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED) in (0, 1)
def com_done() -> None:
    ole32.CoUninitialize()
def class_name(hwnd) -> str:
    buffer = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buffer, 256)
    return buffer.value
def window_text(hwnd) -> str:
    buffer = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(hwnd, buffer, 512)
    return buffer.value
def _visible_of_class(enumerate_with, wanted: str) -> list[int]:
    found: list[int] = []
    def collect(hwnd, _lparam):
        try:
            if user32.IsWindowVisible(hwnd) and class_name(hwnd) == wanted:
                found.append(int(hwnd))
        except Exception:
            pass
        return True
    enumerate_with(_ENUM_PROC(collect))
    return found
def thread_windows(tid: int, wanted: str) -> list[int]:
    return _visible_of_class(lambda proc: user32.EnumThreadWindows(tid, proc, 0), wanted)
def top_windows(wanted: str) -> list[int]:
    return _visible_of_class(lambda proc: user32.EnumWindows(proc, 0), wanted)
def topmost_owner() -> int:
    return int(user32.CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, "STATIC", "",
                                      0, 0, 0, 0, 0, None, None, None, None) or 0)
