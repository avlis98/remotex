using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace RemoteX.NativeInput
{
    internal class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        private const int SM_XVIRTUALSCREEN = 76;
        private const int SM_YVIRTUALSCREEN = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;
        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;

        private const int INPUT_MOUSE = 0;
        private const int INPUT_KEYBOARD = 1;

        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        private static void SendMouse(uint flags, int dx = 0, int dy = 0, uint mouseData = 0)
        {
            INPUT[] inputs = new INPUT[1];
            inputs[0] = new INPUT
            {
                type = INPUT_MOUSE,
                U = new InputUnion
                {
                    mi = new MOUSEINPUT
                    {
                        dx = dx,
                        dy = dy,
                        mouseData = mouseData,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static void MoveCursorNormalized(double normX, double normY)
        {
            int virtLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
            int virtTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
            int virtWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            int virtHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if (virtWidth == 0 || virtHeight == 0)
            {
                virtLeft = 0;
                virtTop = 0;
                virtWidth = GetSystemMetrics(SM_CXSCREEN);
                virtHeight = GetSystemMetrics(SM_CYSCREEN);
            }

            int targetX = virtLeft + (int)Math.Round(normX * virtWidth);
            int targetY = virtTop + (int)Math.Round(normY * virtHeight);

            SetCursorPos(targetX, targetY);
        }

        private static void SendKey(ushort vkCode, bool isKeyUp, bool isExtended = false)
        {
            uint flags = 0;
            if (isKeyUp) flags |= KEYEVENTF_KEYUP;
            if (isExtended) flags |= KEYEVENTF_EXTENDEDKEY;

            INPUT[] inputs = new INPUT[1];
            inputs[0] = new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vkCode,
                        wScan = 0,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = IntPtr.Zero
                    }
                }
            };
            SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static void SendUnicodeText(string text)
        {
            foreach (char c in text)
            {
                INPUT[] inputs = new INPUT[2];
                // Key down
                inputs[0] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    U = new InputUnion
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0,
                            wScan = c,
                            dwFlags = KEYEVENTF_UNICODE,
                            time = 0,
                            dwExtraInfo = IntPtr.Zero
                        }
                    }
                };
                // Key up
                inputs[1] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    U = new InputUnion
                    {
                        ki = new KEYBDINPUT
                        {
                            wVk = 0,
                            wScan = c,
                            dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                            time = 0,
                            dwExtraInfo = IntPtr.Zero
                        }
                    }
                };
                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
            }
        }

        static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine(JsonSerializer.Serialize(new { status = "ready", version = "1.0.0" }));

            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    string type = root.GetProperty("type").GetString() ?? "";

                    switch (type)
                    {
                        case "mouse_move":
                            double nx = root.GetProperty("x").GetDouble();
                            double ny = root.GetProperty("y").GetDouble();
                            MoveCursorNormalized(nx, ny);
                            break;

                        case "mouse_down":
                            int btnDown = root.GetProperty("button").GetInt32();
                            if (btnDown == 0) SendMouse(MOUSEEVENTF_LEFTDOWN);
                            else if (btnDown == 1) SendMouse(MOUSEEVENTF_MIDDLEDOWN);
                            else if (btnDown == 2) SendMouse(MOUSEEVENTF_RIGHTDOWN);
                            break;

                        case "mouse_up":
                            int btnUp = root.GetProperty("button").GetInt32();
                            if (btnUp == 0) SendMouse(MOUSEEVENTF_LEFTUP);
                            else if (btnUp == 1) SendMouse(MOUSEEVENTF_MIDDLEUP);
                            else if (btnUp == 2) SendMouse(MOUSEEVENTF_RIGHTUP);
                            break;

                        case "mouse_click":
                            int btnClick = root.GetProperty("button").GetInt32();
                            if (btnClick == 0)
                            {
                                SendMouse(MOUSEEVENTF_LEFTDOWN);
                                SendMouse(MOUSEEVENTF_LEFTUP);
                            }
                            else if (btnClick == 1)
                            {
                                SendMouse(MOUSEEVENTF_MIDDLEDOWN);
                                SendMouse(MOUSEEVENTF_MIDDLEUP);
                            }
                            else if (btnClick == 2)
                            {
                                SendMouse(MOUSEEVENTF_RIGHTDOWN);
                                SendMouse(MOUSEEVENTF_RIGHTUP);
                            }
                            break;

                        case "mouse_wheel":
                            int dy = root.TryGetProperty("deltaY", out var dEl) ? dEl.GetInt32() : 0;
                            // Win32 wheel: positive is forward/up, negative is down
                            SendMouse(MOUSEEVENTF_WHEEL, 0, 0, (uint)(-dy));
                            break;

                        case "key_down":
                            ushort vkDown = (ushort)root.GetProperty("vkCode").GetInt32();
                            SendKey(vkDown, false);
                            break;

                        case "key_up":
                            ushort vkUp = (ushort)root.GetProperty("vkCode").GetInt32();
                            SendKey(vkUp, true);
                            break;

                        case "text":
                            string content = root.GetProperty("text").GetString() ?? "";
                            SendUnicodeText(content);
                            break;

                        case "screen_info":
                            int w = GetSystemMetrics(SM_CXSCREEN);
                            int h = GetSystemMetrics(SM_CYSCREEN);
                            int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                            int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                            Console.WriteLine(JsonSerializer.Serialize(new { status = "ok", screenWidth = w, screenHeight = h, virtualWidth = vw, virtualHeight = vh }));
                            continue;

                        case "ping":
                            Console.WriteLine(JsonSerializer.Serialize(new { status = "pong" }));
                            continue;

                        default:
                            break;
                    }

                    Console.WriteLine(JsonSerializer.Serialize(new { status = "ok" }));
                }
                catch (Exception ex)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { status = "error", message = ex.Message }));
                }
            }
        }
    }
}
