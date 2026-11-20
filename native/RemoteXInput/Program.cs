using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace RemoteX.NativeInput
{
    internal class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        private static extern bool GetCursorInfo(out CURSORINFO pci);

        [DllImport("user32.dll")]
        private static extern bool DrawIcon(IntPtr hDC, int X, int Y, IntPtr hIcon);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        private const int SW_MINIMIZE = 6;

        private static void MinimizeRemoteXWindow()
        {
            try
            {
                bool found = false;
                EnumWindows((hWnd, lParam) =>
                {
                    if (!IsWindowVisible(hWnd)) return true;
                    StringBuilder sb = new StringBuilder(256);
                    GetWindowText(hWnd, sb, 256);
                    string title = sb.ToString();
                    if (!string.IsNullOrEmpty(title) && title.IndexOf("RemoteX", StringComparison.OrdinalIgnoreCase) >= 0 &&
                        title.IndexOf("Chat da Sess", StringComparison.OrdinalIgnoreCase) < 0)
                    {
                        ShowWindow(hWnd, SW_MINIMIZE);
                        found = true;
                    }
                    return true;
                }, IntPtr.Zero);

                if (!found)
                {
                    IntPtr fg = GetForegroundWindow();
                    if (fg != IntPtr.Zero) ShowWindow(fg, SW_MINIMIZE);
                }
            }
            catch { }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct CURSORINFO
        {
            public int cbSize;
            public int flags;
            public IntPtr hCursor;
            public POINT ptScreenPos;
        }

        private const int CURSOR_SHOWING = 0x00000001;

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
        private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

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

        private static readonly object ConsoleLock = new object();
        private static volatile bool isStreaming = false;
        private static volatile int targetFps = 22;
        private static volatile int jpegQuality = 70;
        private static volatile int maxCaptureWidth = 1600;
        private static long frameSequence = 0;
        private static ImageCodecInfo jpegEncoder = null;
        private static Bitmap reusableFullBmp = null;
        private static Bitmap reusableScaledBmp = null;

        // Native Always-On-Top (TopMost) Chat Window so chat always appears over any open app on the remote PC
        private static Form chatForm = null;
        private static RichTextBox chatHistoryBox = null;
        private static TextBox chatInputBox = null;
        private static Thread chatUiThread = null;
        private static readonly ManualResetEvent chatUiReady = new ManualResetEvent(false);

        private static void EnsureChatWindowThread()
        {
            if (chatUiThread != null && chatUiThread.IsAlive) return;
            chatUiReady.Reset();
            chatUiThread = new Thread(() =>
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                chatForm = new Form
                {
                    Text = "RemoteX - Chat da Sessão",
                    Size = new Size(360, 420),
                    FormBorderStyle = FormBorderStyle.FixedToolWindow,
                    StartPosition = FormStartPosition.Manual,
                    TopMost = true,
                    ShowInTaskbar = true,
                    BackColor = Color.FromArgb(11, 20, 36),
                    ForeColor = Color.White
                };

                Rectangle workArea = Screen.PrimaryScreen.WorkingArea;
                chatForm.Location = new Point(workArea.Right - chatForm.Width - 20, workArea.Bottom - chatForm.Height - 20);

                Panel header = new Panel
                {
                    Dock = DockStyle.Top,
                    Height = 38,
                    BackColor = Color.FromArgb(0, 102, 243)
                };
                Label titleLbl = new Label
                {
                    Text = "💬 Chat da Sessão RemoteX",
                    Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                    ForeColor = Color.White,
                    Location = new Point(12, 9),
                    AutoSize = true
                };
                header.Controls.Add(titleLbl);

                Panel bottomPanel = new Panel
                {
                    Dock = DockStyle.Bottom,
                    Height = 46,
                    Padding = new Padding(8),
                    BackColor = Color.FromArgb(9, 16, 30)
                };

                chatInputBox = new TextBox
                {
                    Location = new Point(10, 11),
                    Width = 248,
                    Font = new Font("Segoe UI", 9.5f),
                    BackColor = Color.FromArgb(18, 32, 56),
                    ForeColor = Color.White,
                    BorderStyle = BorderStyle.FixedSingle
                };

                Button btnSend = new Button
                {
                    Text = "Enviar",
                    Location = new Point(266, 9),
                    Size = new Size(70, 27),
                    BackColor = Color.FromArgb(0, 112, 243),
                    ForeColor = Color.White,
                    FlatStyle = FlatStyle.Flat,
                    Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                    Cursor = Cursors.Hand
                };
                btnSend.FlatAppearance.BorderSize = 0;

                Action sendReplyAction = () =>
                {
                    string txt = chatInputBox.Text.Trim();
                    if (string.IsNullOrEmpty(txt)) return;
                    chatInputBox.Text = "";
                    string timeStr = DateTime.Now.ToString("HH:mm");
                    AppendNativeChatLine("Você", txt, timeStr, true);
                    WriteJsonLine("{\"status\":\"chat_reply\",\"text\":\"" + EscapeJson(txt) + "\",\"timestamp\":\"" + timeStr + "\"}");
                };

                btnSend.Click += (s, e) => sendReplyAction();
                chatInputBox.KeyDown += (s, e) =>
                {
                    if (e.KeyCode == Keys.Enter)
                    {
                        e.SuppressKeyPress = true;
                        sendReplyAction();
                    }
                };

                bottomPanel.Controls.Add(chatInputBox);
                bottomPanel.Controls.Add(btnSend);

                chatHistoryBox = new RichTextBox
                {
                    Dock = DockStyle.Fill,
                    ReadOnly = true,
                    BackColor = Color.FromArgb(11, 20, 36),
                    ForeColor = Color.FromArgb(241, 245, 249),
                    BorderStyle = BorderStyle.None,
                    Font = new Font("Segoe UI", 9.5f),
                    Padding = new Padding(10)
                };

                chatForm.Controls.Add(chatHistoryBox);
                chatForm.Controls.Add(bottomPanel);
                chatForm.Controls.Add(header);

                // Hide instead of destroying on close so future messages reopen it immediately
                chatForm.FormClosing += (s, e) =>
                {
                    if (e.CloseReason == CloseReason.UserClosing)
                    {
                        e.Cancel = true;
                        chatForm.Hide();
                    }
                };

                chatForm.Load += (s, e) => chatUiReady.Set();
                chatForm.Show();
                chatForm.Hide();
                chatUiReady.Set();
                Application.Run();
            });
            chatUiThread.SetApartmentState(ApartmentState.STA);
            chatUiThread.IsBackground = true;
            chatUiThread.Start();
            chatUiReady.WaitOne(1500);
        }

        private static void AppendNativeChatLine(string sender, string text, string timeStr, bool isSelf)
        {
            if (chatHistoryBox == null) return;
            chatHistoryBox.SelectionStart = chatHistoryBox.TextLength;
            chatHistoryBox.SelectionLength = 0;
            chatHistoryBox.SelectionColor = isSelf ? Color.FromArgb(0, 194, 255) : Color.FromArgb(52, 211, 153);
            chatHistoryBox.SelectionFont = new Font("Segoe UI", 9f, FontStyle.Bold);
            chatHistoryBox.AppendText("[" + timeStr + "] " + sender + ": ");

            chatHistoryBox.SelectionColor = Color.White;
            chatHistoryBox.SelectionFont = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            chatHistoryBox.AppendText(text + Environment.NewLine + Environment.NewLine);
            chatHistoryBox.ScrollToCaret();
        }

        private static void ShowIncomingChatPopup(string sender, string text, string timeStr)
        {
            try
            {
                EnsureChatWindowThread();
                if (chatForm != null && chatForm.IsHandleCreated)
                {
                    chatForm.BeginInvoke(new Action(() =>
                    {
                        Rectangle workArea = Screen.PrimaryScreen.WorkingArea;
                        chatForm.Location = new Point(workArea.Right - chatForm.Width - 20, workArea.Bottom - chatForm.Height - 20);
                        if (!chatForm.Visible) chatForm.Show();
                        if (chatForm.WindowState == FormWindowState.Minimized) chatForm.WindowState = FormWindowState.Normal;
                        chatForm.TopMost = true;
                        chatForm.BringToFront();
                        AppendNativeChatLine(string.IsNullOrEmpty(sender) ? "Remoto" : sender, text, string.IsNullOrEmpty(timeStr) ? DateTime.Now.ToString("HH:mm") : timeStr, false);
                        System.Media.SystemSounds.Asterisk.Play();
                    }));
                }
            }
            catch { }
        }

        private static ImageCodecInfo GetJpegEncoder()
        {
            if (jpegEncoder != null) return jpegEncoder;
            foreach (var codec in ImageCodecInfo.GetImageDecoders())
            {
                if (codec.FormatID == ImageFormat.Jpeg.Guid)
                {
                    jpegEncoder = codec;
                    return codec;
                }
            }
            return null;
        }

        private static void WriteJsonLine(string json)
        {
            lock (ConsoleLock)
            {
                Console.WriteLine(json);
            }
        }

        private static void GetScreenBounds(out int left, out int top, out int width, out int height)
        {
            left = GetSystemMetrics(SM_XVIRTUALSCREEN);
            top = GetSystemMetrics(SM_YVIRTUALSCREEN);
            width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
            height = GetSystemMetrics(SM_CYVIRTUALSCREEN);

            if (width <= 0 || height <= 0)
            {
                left = 0;
                top = 0;
                width = GetSystemMetrics(SM_CXSCREEN);
                height = GetSystemMetrics(SM_CYSCREEN);
            }
            if (width <= 0) width = 1920;
            if (height <= 0) height = 1080;
        }

        private static void MoveCursorNormalized(double normX, double normY, bool positionOnly = false)
        {
            normX = Math.Max(0.0, Math.Min(1.0, normX));
            normY = Math.Max(0.0, Math.Min(1.0, normY));

            int left, top, width, height;
            GetScreenBounds(out left, out top, out width, out height);

            int targetX = left + (int)Math.Round(normX * (width - 1));
            int targetY = top + (int)Math.Round(normY * (height - 1));

            SetCursorPos(targetX, targetY);
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

        private static bool IsExtendedKey(ushort vk)
        {
            // Arrows, Home, End, Prior(PgUp), Next(PgDn), Insert, Delete, RControl, RMenu, LWin, RWin, Divide
            return (vk >= 0x21 && vk <= 0x2E) || vk == 0x5B || vk == 0x5C || vk == 0xA3 || vk == 0xA5 || vk == 0x6F;
        }

        private static void SendKey(ushort vkCode, bool isKeyUp)
        {
            if (vkCode == 0) return;
            uint flags = 0;
            if (isKeyUp) flags |= KEYEVENTF_KEYUP;
            if (IsExtendedKey(vkCode)) flags |= KEYEVENTF_EXTENDEDKEY;

            ushort scan = (ushort)MapVirtualKey(vkCode, 0);

            INPUT[] inputs = new INPUT[1];
            inputs[0] = new INPUT
            {
                type = INPUT_KEYBOARD,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vkCode,
                        wScan = scan,
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
            if (string.IsNullOrEmpty(text)) return;
            foreach (char c in text)
            {
                INPUT[] inputs = new INPUT[2];
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

        private static void CaptureAndSendFrame()
        {
            try
            {
                int left, top, width, height;
                GetScreenBounds(out left, out top, out width, out height);

                int outW = width;
                int outH = height;
                if (outW > maxCaptureWidth)
                {
                    double ratio = (double)maxCaptureWidth / outW;
                    outW = maxCaptureWidth;
                    outH = Math.Max(360, (int)Math.Round(height * ratio));
                }

                if (reusableFullBmp == null || reusableFullBmp.Width != width || reusableFullBmp.Height != height)
                {
                    if (reusableFullBmp != null) reusableFullBmp.Dispose();
                    reusableFullBmp = new Bitmap(width, height, PixelFormat.Format24bppRgb);
                }

                using (Graphics g = Graphics.FromImage(reusableFullBmp))
                {
                    g.CopyFromScreen(left, top, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                }

                using (MemoryStream ms = new MemoryStream())
                {
                    var encoder = GetJpegEncoder();
                    var encParams = new EncoderParameters(1);
                    encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)jpegQuality);

                    if (outW != width || outH != height)
                    {
                        if (reusableScaledBmp == null || reusableScaledBmp.Width != outW || reusableScaledBmp.Height != outH)
                        {
                            if (reusableScaledBmp != null) reusableScaledBmp.Dispose();
                            reusableScaledBmp = new Bitmap(outW, outH, PixelFormat.Format24bppRgb);
                        }
                        using (Graphics gs = Graphics.FromImage(reusableScaledBmp))
                        {
                            gs.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                            gs.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighSpeed;
                            gs.DrawImage(reusableFullBmp, 0, 0, outW, outH);
                        }
                        if (encoder != null) reusableScaledBmp.Save(ms, encoder, encParams);
                        else reusableScaledBmp.Save(ms, ImageFormat.Jpeg);
                    }
                    else
                    {
                        if (encoder != null) reusableFullBmp.Save(ms, encoder, encParams);
                        else reusableFullBmp.Save(ms, ImageFormat.Jpeg);
                    }

                    string b64 = Convert.ToBase64String(ms.ToArray());
                    long seq = Interlocked.Increment(ref frameSequence);
                    WriteJsonLine("{\"status\":\"frame\",\"seq\":" + seq + ",\"width\":" + outW + ",\"height\":" + outH + ",\"jpeg\":\"" + b64 + "\"}");
                }
            }
            catch (Exception ex)
            {
                WriteJsonLine("{\"status\":\"capture_error\",\"message\":\"" + EscapeJson(ex.Message) + "\"}");
            }
        }

        private static void StreamWorkerLoop()
        {
            while (true)
            {
                if (isStreaming)
                {
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    CaptureAndSendFrame();
                    sw.Stop();
                    int intervalMs = Math.Max(30, 1000 / Math.Max(1, targetFps));
                    int sleepMs = Math.Max(5, intervalMs - (int)sw.ElapsedMilliseconds);
                    Thread.Sleep(sleepMs);
                }
                else
                {
                    Thread.Sleep(80);
                }
            }
        }

        // Lightweight JSON property extractors (compatible with .NET Framework 4.x without external DLLs)
        private static string ExtractString(string json, string key)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return "";
            int colon = json.IndexOf(':', idx + pattern.Length);
            if (colon < 0) return "";
            int firstQuote = json.IndexOf('"', colon + 1);
            if (firstQuote < 0) return "";
            StringBuilder sb = new StringBuilder();
            for (int i = firstQuote + 1; i < json.Length; i++)
            {
                char c = json[i];
                if (c == '\\' && i + 1 < json.Length)
                {
                    char next = json[++i];
                    if (next == 'n') sb.Append('\n');
                    else if (next == 'r') sb.Append('\r');
                    else if (next == 't') sb.Append('\t');
                    else sb.Append(next);
                }
                else if (c == '"')
                {
                    break;
                }
                else
                {
                    sb.Append(c);
                }
            }
            return sb.ToString();
        }

        private static double ExtractDouble(string json, string key, double defaultVal = -1.0)
        {
            string pattern = "\"" + key + "\"";
            int idx = json.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
            if (idx < 0) return defaultVal;
            int colon = json.IndexOf(':', idx + pattern.Length);
            if (colon < 0) return defaultVal;
            int start = colon + 1;
            while (start < json.Length && (json[start] == ' ' || json[start] == '\t')) start++;
            int end = start;
            while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '.' || json[end] == '-')) end++;
            if (end <= start) return defaultVal;
            double res;
            if (double.TryParse(json.Substring(start, end - start), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out res))
            {
                return res;
            }
            return defaultVal;
        }

        private static int ExtractInt(string json, string key, int defaultVal = 0)
        {
            return (int)Math.Round(ExtractDouble(json, key, defaultVal));
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        [STAThread]
        static void Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            Thread streamThread = new Thread(StreamWorkerLoop);
            streamThread.IsBackground = true;
            streamThread.Start();

            WriteJsonLine("{\"status\":\"ready\",\"version\":\"2.0.0\",\"dpiAware\":true,\"nativeCapture\":true}");

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    string type = ExtractString(line, "type");
                    switch (type)
                    {
                        case "mouse_move":
                            double nx = ExtractDouble(line, "x", 0.5);
                            double ny = ExtractDouble(line, "y", 0.5);
                            MoveCursorNormalized(nx, ny);
                            break;

                        case "mouse_down":
                            double downX = ExtractDouble(line, "x", -1.0);
                            double downY = ExtractDouble(line, "y", -1.0);
                            if (downX >= 0.0 && downY >= 0.0) MoveCursorNormalized(downX, downY);
                            int btnDown = ExtractInt(line, "button", 0);
                            if (btnDown == 0) SendMouse(MOUSEEVENTF_LEFTDOWN);
                            else if (btnDown == 1) SendMouse(MOUSEEVENTF_MIDDLEDOWN);
                            else if (btnDown == 2) SendMouse(MOUSEEVENTF_RIGHTDOWN);
                            break;

                        case "mouse_up":
                            double upX = ExtractDouble(line, "x", -1.0);
                            double upY = ExtractDouble(line, "y", -1.0);
                            if (upX >= 0.0 && upY >= 0.0) MoveCursorNormalized(upX, upY);
                            int btnUp = ExtractInt(line, "button", 0);
                            if (btnUp == 0) SendMouse(MOUSEEVENTF_LEFTUP);
                            else if (btnUp == 1) SendMouse(MOUSEEVENTF_MIDDLEUP);
                            else if (btnUp == 2) SendMouse(MOUSEEVENTF_RIGHTUP);
                            break;

                        case "mouse_click":
                            double clickX = ExtractDouble(line, "x", -1.0);
                            double clickY = ExtractDouble(line, "y", -1.0);
                            if (clickX >= 0.0 && clickY >= 0.0) MoveCursorNormalized(clickX, clickY);
                            int btnClick = ExtractInt(line, "button", 0);
                            if (btnClick == 0) { SendMouse(MOUSEEVENTF_LEFTDOWN); SendMouse(MOUSEEVENTF_LEFTUP); }
                            else if (btnClick == 1) { SendMouse(MOUSEEVENTF_MIDDLEDOWN); SendMouse(MOUSEEVENTF_MIDDLEUP); }
                            else if (btnClick == 2) { SendMouse(MOUSEEVENTF_RIGHTDOWN); SendMouse(MOUSEEVENTF_RIGHTUP); }
                            break;

                        case "mouse_wheel":
                            int dy = ExtractInt(line, "deltaY", 0);
                            SendMouse(MOUSEEVENTF_WHEEL, 0, 0, (uint)(-dy));
                            break;

                        case "key_down":
                            ushort vkDown = (ushort)ExtractInt(line, "vkCode", 0);
                            SendKey(vkDown, false);
                            break;

                        case "key_up":
                            ushort vkUp = (ushort)ExtractInt(line, "vkCode", 0);
                            SendKey(vkUp, true);
                            break;

                        case "text":
                            string content = ExtractString(line, "text");
                            SendUnicodeText(content);
                            break;

                        case "clipboard_sync":
                            string clipText = ExtractString(line, "text");
                            if (!string.IsNullOrEmpty(clipText))
                            {
                                Thread staThread = new Thread(() =>
                                {
                                    try { Clipboard.SetText(clipText); } catch { }
                                });
                                staThread.SetApartmentState(ApartmentState.STA);
                                staThread.Start();
                            }
                            break;

                        case "chat_popup":
                            string chatText = ExtractString(line, "text");
                            string chatTime = ExtractString(line, "timestamp");
                            string chatSender = ExtractString(line, "sender");
                            if (!string.IsNullOrEmpty(chatText))
                            {
                                ShowIncomingChatPopup(chatSender, chatText, chatTime);
                            }
                            break;

                        case "start_capture":
                        case "set_quality":
                            targetFps = Math.Max(5, Math.Min(30, ExtractInt(line, "fps", 15)));
                            jpegQuality = Math.Max(30, Math.Min(95, ExtractInt(line, "quality", 82)));
                            maxCaptureWidth = Math.Max(1024, Math.Min(3840, ExtractInt(line, "maxWidth", 1920)));
                            if (type == "start_capture") isStreaming = true;
                            break;

                        case "stop_capture":
                            isStreaming = false;
                            break;

                        case "minimize_window":
                            MinimizeRemoteXWindow();
                            break;

                        case "capture_frame":
                            CaptureAndSendFrame();
                            continue;

                        case "screen_info":
                            int l, t, w, h;
                            GetScreenBounds(out l, out t, out w, out h);
                            WriteJsonLine("{\"status\":\"ok\",\"screenWidth\":" + w + ",\"screenHeight\":" + h + "}");
                            continue;
                    }
                }
                catch (Exception ex)
                {
                    WriteJsonLine("{\"status\":\"error\",\"message\":\"" + EscapeJson(ex.Message) + "\"}");
                }
            }
        }
    }
}
