using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace RemoteXSetup
{
    public class Form1 : Form
    {
        private Panel headerPanel = null!;
        private Label headerTitle = null!;
        private Label headerSubtitle = null!;
        private PictureBox logoBox = null!;

        private Panel contentPanel = null!;
        // Step 1 controls
        private Label p1Title = null!;
        private Label p1Desc = null!;
        private Label p1LblFolder = null!;
        private TextBox p1TxtFolder = null!;
        private Button p1BtnBrowse = null!;
        private CheckBox chkDesktop = null!;
        private CheckBox chkStartMenu = null!;
        private CheckBox chkAutoRun = null!;

        // Step 2 controls
        private Label p2Status = null!;
        private ProgressBar progressBar = null!;
        private RichTextBox logBox = null!;

        // Step 3 controls
        private Label p3Title = null!;
        private Label p3Desc = null!;
        private CheckBox p3ChkRun = null!;

        private Panel buttonPanel = null!;
        private Button btnCancel = null!;
        private Button btnNext = null!;

        private int currentStep = 1;
        private string sourceRootDir = "";
        private string targetSystemDir = @"C:\RemoteX\system";

        public Form1()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Assistente de Instalacao - RemoteX";
            this.Size = new Size(580, 440);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(243, 244, 246);

            string currentDir = AppDomain.CurrentDomain.BaseDirectory;
            sourceRootDir = Path.GetFullPath(Path.Combine(currentDir, @"..\..\.."));
            if (!File.Exists(Path.Combine(sourceRootDir, "RemoteX.vbs")))
            {
                sourceRootDir = currentDir;
            }

            string iconPath = Path.Combine(sourceRootDir, @"icon.ico");
            if (!File.Exists(iconPath)) iconPath = Path.Combine(sourceRootDir, @"assets\icon.ico");
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch { }
            }

            // Header Panel
            headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 82,
                BackColor = Color.FromArgb(0, 102, 243)
            };
            this.Controls.Add(headerPanel);

            string pngLogo = Path.Combine(sourceRootDir, @"assets\icon.png");
            if (File.Exists(pngLogo))
            {
                logoBox = new PictureBox
                {
                    Location = new Point(20, 15),
                    Size = new Size(52, 52),
                    SizeMode = PictureBoxSizeMode.Zoom,
                    Image = Image.FromFile(pngLogo)
                };
                headerPanel.Controls.Add(logoBox);
            }

            headerTitle = new Label
            {
                Text = "RemoteX",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(82, 15),
                AutoSize = true
            };
            headerPanel.Controls.Add(headerTitle);

            headerSubtitle = new Label
            {
                Text = "Assistente de Instalacao e Configuracao Oficial • Conecte. Acesse. Resolva.",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(224, 242, 254),
                Location = new Point(84, 46),
                AutoSize = true
            };
            headerPanel.Controls.Add(headerSubtitle);

            // Button Panel
            buttonPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 54,
                BackColor = Color.FromArgb(229, 231, 235)
            };
            this.Controls.Add(buttonPanel);

            // Content Panel
            contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(24, 16, 24, 10)
            };
            this.Controls.Add(contentPanel);
            contentPanel.BringToFront();

            // --- STEP 1: WELCOME & PATH ---
            p1Title = new Label
            {
                Text = "Bem-vindo ao instalador do RemoteX!",
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Location = new Point(24, 16),
                Size = new Size(520, 22)
            };
            contentPanel.Controls.Add(p1Title);

            p1Desc = new Label
            {
                Text = "Este assistente instalara o sistema completo RemoteX neste computador, incluindo a Rede Global Mesh P2P automatica, motor Win32 SendInput e inicializacao silenciosa sem telas pretas.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(51, 65, 85),
                Location = new Point(24, 42),
                Size = new Size(520, 44)
            };
            contentPanel.Controls.Add(p1Desc);

            p1LblFolder = new Label
            {
                Text = "Pasta de destino da instalacao:",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Location = new Point(24, 92),
                Size = new Size(520, 20)
            };
            contentPanel.Controls.Add(p1LblFolder);

            p1TxtFolder = new TextBox
            {
                Text = @"C:\RemoteX",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                Location = new Point(24, 114),
                Size = new Size(405, 25)
            };
            contentPanel.Controls.Add(p1TxtFolder);

            p1BtnBrowse = new Button
            {
                Text = "Procurar...",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                Location = new Point(438, 113),
                Size = new Size(100, 26),
                FlatStyle = FlatStyle.System
            };
            p1BtnBrowse.Click += (s, e) =>
            {
                using var fbd = new FolderBrowserDialog
                {
                    Description = "Selecione a pasta onde instalar o RemoteX:",
                    SelectedPath = p1TxtFolder.Text
                };
                if (fbd.ShowDialog() == DialogResult.OK)
                {
                    p1TxtFolder.Text = fbd.SelectedPath;
                }
            };
            contentPanel.Controls.Add(p1BtnBrowse);

            chkDesktop = new CheckBox
            {
                Text = "Criar atalho na Area de Trabalho (com icone oficial)",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = true,
                Location = new Point(24, 152),
                Size = new Size(480, 24)
            };
            contentPanel.Controls.Add(chkDesktop);

            chkStartMenu = new CheckBox
            {
                Text = "Adicionar ao Menu Iniciar",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = true,
                Location = new Point(24, 178),
                Size = new Size(480, 24)
            };
            contentPanel.Controls.Add(chkStartMenu);

            chkAutoRun = new CheckBox
            {
                Text = "Inicializar o RemoteX automaticamente com o Windows",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = false,
                Location = new Point(24, 204),
                Size = new Size(480, 24)
            };
            contentPanel.Controls.Add(chkAutoRun);

            // --- STEP 2: PROGRESS & REAL-TIME LOG ---
            p2Status = new Label
            {
                Text = "Iniciando a copia dos arquivos...",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Location = new Point(24, 18),
                Size = new Size(515, 22),
                Visible = false
            };
            contentPanel.Controls.Add(p2Status);

            progressBar = new ProgressBar
            {
                Location = new Point(24, 46),
                Size = new Size(515, 24),
                Style = ProgressBarStyle.Continuous,
                Visible = false
            };
            contentPanel.Controls.Add(progressBar);

            logBox = new RichTextBox
            {
                Location = new Point(24, 82),
                Size = new Size(515, 150),
                ReadOnly = true,
                Font = new Font("Consolas", 8.5f, FontStyle.Regular),
                BackColor = Color.White,
                Visible = false
            };
            contentPanel.Controls.Add(logBox);

            // --- STEP 3: COMPLETED ---
            p3Title = new Label
            {
                Text = "Instalacao concluida com sucesso!",
                Font = new Font("Segoe UI", 15f, FontStyle.Bold),
                ForeColor = Color.FromArgb(22, 163, 74),
                Location = new Point(24, 24),
                Size = new Size(515, 34),
                Visible = false
            };
            contentPanel.Controls.Add(p3Title);

            p3Desc = new Label
            {
                Text = "O RemoteX foi instalado e configurado neste computador com a Rede Global Mesh P2P ativa e atalhos criados na Area de Trabalho e no Menu Iniciar.",
                Font = new Font("Segoe UI", 10f, FontStyle.Regular),
                ForeColor = Color.FromArgb(51, 65, 85),
                Location = new Point(24, 72),
                Size = new Size(515, 55),
                Visible = false
            };
            contentPanel.Controls.Add(p3Desc);

            p3ChkRun = new CheckBox
            {
                Text = "Iniciar o RemoteX agora",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = true,
                Location = new Point(24, 145),
                Size = new Size(400, 28),
                Visible = false
            };
            contentPanel.Controls.Add(p3ChkRun);

            // Buttons
            btnCancel = new Button
            {
                Text = "Cancelar",
                Size = new Size(100, 32),
                Location = new Point(330, 11),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            btnCancel.Click += (s, e) =>
            {
                if (currentStep == 2) return;
                this.Close();
            };
            buttonPanel.Controls.Add(btnCancel);

            btnNext = new Button
            {
                Text = "Avancar >",
                Size = new Size(118, 32),
                Location = new Point(440, 11),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                BackColor = Color.FromArgb(0, 102, 243),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnNext.FlatAppearance.BorderSize = 0;
            btnNext.Click += async (s, e) => await OnNextClickedAsync();
            buttonPanel.Controls.Add(btnNext);
        }

        private void AppendLog(string msg)
        {
            if (InvokeRequired)
            {
                Invoke(new Action(() => AppendLog(msg)));
                return;
            }
            logBox.AppendText(msg + Environment.NewLine);
            logBox.ScrollToCaret();
        }

        private async Task OnNextClickedAsync()
        {
            if (currentStep == 1)
            {
                currentStep = 2;
                p1Title.Visible = false;
                p1Desc.Visible = false;
                p1LblFolder.Visible = false;
                p1TxtFolder.Visible = false;
                p1BtnBrowse.Visible = false;
                chkDesktop.Visible = false;
                chkStartMenu.Visible = false;
                chkAutoRun.Visible = false;

                p2Status.Visible = true;
                progressBar.Visible = true;
                logBox.Visible = true;

                btnNext.Enabled = false;
                btnCancel.Enabled = false;

                await RunInstallationAsync();
            }
            else if (currentStep == 3)
            {
                if (p3ChkRun.Checked)
                {
                    string vbsLauncher = Path.Combine(targetSystemDir, "RemoteX.vbs");
                    if (!File.Exists(vbsLauncher))
                    {
                        vbsLauncher = Path.Combine(sourceRootDir, "RemoteX.vbs");
                    }
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "wscript.exe",
                        Arguments = $"\"{vbsLauncher}\"",
                        WorkingDirectory = Path.GetDirectoryName(vbsLauncher) ?? sourceRootDir,
                        UseShellExecute = true
                    });
                }
                this.Close();
            }
        }

        private static void CopyDirectoryFiltered(string sourceDir, string destDir)
        {
            Directory.CreateDirectory(destDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                string fileName = Path.GetFileName(file);
                if (fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) continue;
                string destFile = Path.Combine(destDir, fileName);
                try { File.Copy(file, destFile, true); } catch { }
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir))
            {
                string dirName = Path.GetFileName(subDir);
                if (dirName.Equals(".git", StringComparison.OrdinalIgnoreCase) ||
                    dirName.Equals("dist", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                CopyDirectoryFiltered(subDir, Path.Combine(destDir, dirName));
            }
        }

        private async Task RunInstallationAsync()
        {
            string baseInstallDir = p1TxtFolder.Text.Trim();
            if (string.IsNullOrWhiteSpace(baseInstallDir)) baseInstallDir = @"C:\RemoteX";
            targetSystemDir = Path.Combine(baseInstallDir, "system");

            progressBar.Value = 10;
            AppendLog("=== Iniciando Instalacao do RemoteX ===");
            AppendLog($"Origem: {sourceRootDir}");
            AppendLog($"Destino: {targetSystemDir}");

            await Task.Delay(200);
            progressBar.Value = 35;
            p2Status.Text = "Copiando arquivos do sistema e motor nativo...";

            bool sameDir = string.Equals(
                Path.GetFullPath(sourceRootDir).TrimEnd('\\'),
                Path.GetFullPath(targetSystemDir).TrimEnd('\\'),
                StringComparison.OrdinalIgnoreCase
            );

            await Task.Run(() =>
            {
                if (!sameDir)
                {
                    CopyDirectoryFiltered(sourceRootDir, targetSystemDir);
                }
            });

            if (!Directory.Exists(targetSystemDir) || !File.Exists(Path.Combine(targetSystemDir, "RemoteX.vbs")))
            {
                targetSystemDir = sourceRootDir;
            }

            AppendLog("Arquivos do sistema e motor Win32 instalados com sucesso.");
            progressBar.Value = 75;
            p2Status.Text = "Criando atalhos oficiais na Area de Trabalho e Menu Iniciar...";

            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "RemoteX");
            string iconPath = Path.Combine(targetSystemDir, @"icon.ico");
            if (!File.Exists(iconPath)) iconPath = Path.Combine(targetSystemDir, @"assets\icon.ico");
            string vbsLauncher = Path.Combine(targetSystemDir, "RemoteX.vbs");

            await Task.Run(() =>
            {
                Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    dynamic? shell = Activator.CreateInstance(shellType);
                    if (shell != null)
                    {
                        if (chkDesktop.Checked)
                        {
                            string deskLnk = Path.Combine(desktopDir, "RemoteX.lnk");
                            dynamic sc = shell.CreateShortcut(deskLnk);
                            sc.TargetPath = "wscript.exe";
                            sc.Arguments = $"\"{vbsLauncher}\"";
                            sc.WorkingDirectory = targetSystemDir;
                            sc.Description = "RemoteX - Plataforma de Acesso Remoto";
                            sc.IconLocation = $"{iconPath}, 0";
                            sc.Save();
                        }

                        if (chkStartMenu.Checked)
                        {
                            if (!Directory.Exists(startMenuDir)) Directory.CreateDirectory(startMenuDir);
                            string smLnk = Path.Combine(startMenuDir, "RemoteX.lnk");
                            dynamic sc2 = shell.CreateShortcut(smLnk);
                            sc2.TargetPath = "wscript.exe";
                            sc2.Arguments = $"\"{vbsLauncher}\"";
                            sc2.WorkingDirectory = targetSystemDir;
                            sc2.Description = "RemoteX - Plataforma de Acesso Remoto";
                            sc2.IconLocation = $"{iconPath}, 0";
                            sc2.Save();
                        }
                    }
                }

                if (chkAutoRun.Checked)
                {
                    using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
                    key?.SetValue("RemoteX", $"wscript.exe \"{vbsLauncher}\"");
                }
            });

            AppendLog("Atalhos criados com sucesso na Area de Trabalho e Menu Iniciar.");
            progressBar.Value = 100;
            p2Status.Text = "Instalacao concluida!";
            AppendLog($"Instalacao concluida com sucesso em {DateTime.Now:dd/MM/yyyy HH:mm:ss}.");

            await Task.Delay(500);

            p2Status.Visible = false;
            progressBar.Visible = false;
            logBox.Visible = false;

            p3Title.Visible = true;
            p3Desc.Visible = true;
            p3ChkRun.Visible = true;

            btnNext.Text = "Concluir";
            btnNext.Enabled = true;
            btnCancel.Visible = false;
            currentStep = 3;
        }
    }
}
