using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
        private Label descLabel = null!;
        private CheckBox chkDesktop = null!;
        private CheckBox chkStartMenu = null!;
        private CheckBox chkAutoRun = null!;
        private ProgressBar progressBar = null!;
        private Label statusLabel = null!;

        private Panel buttonPanel = null!;
        private Button btnCancel = null!;
        private Button btnInstall = null!;

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
            string rootDir = Path.GetFullPath(Path.Combine(currentDir, @"..\..\.."));
            if (!File.Exists(Path.Combine(rootDir, "RemoteX.vbs")))
            {
                rootDir = currentDir;
            }

            string iconPath = Path.Combine(rootDir, @"assets\icon.ico");
            if (File.Exists(iconPath))
            {
                try { this.Icon = new Icon(iconPath); } catch {}
            }

            // Header Panel
            headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 85,
                BackColor = Color.FromArgb(0, 102, 243)
            };
            this.Controls.Add(headerPanel);

            string pngLogo = Path.Combine(rootDir, @"assets\icon.png");
            if (File.Exists(pngLogo))
            {
                logoBox = new PictureBox
                {
                    Location = new Point(20, 16),
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
                Location = new Point(82, 16),
                AutoSize = true
            };
            headerPanel.Controls.Add(headerTitle);

            headerSubtitle = new Label
            {
                Text = "Assistente de Instalacao Oficial • Conecte. Acesse. Resolva.",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(224, 242, 254),
                Location = new Point(84, 48),
                AutoSize = true
            };
            headerPanel.Controls.Add(headerSubtitle);

            // Content Panel
            contentPanel = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(25, 20, 25, 10)
            };
            this.Controls.Add(contentPanel);

            descLabel = new Label
            {
                Text = "O RemoteX sera configurado no seu computador com inicializacao rapida sem telas pretas e modo desktop nativo.",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(51, 65, 85),
                Location = new Point(25, 100),
                Size = new Size(515, 45)
            };
            this.Controls.Add(descLabel);

            chkDesktop = new CheckBox
            {
                Text = "Criar atalho na Area de Trabalho (com icone oficial)",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = true,
                Location = new Point(25, 155),
                Size = new Size(480, 25)
            };
            this.Controls.Add(chkDesktop);

            chkStartMenu = new CheckBox
            {
                Text = "Adicionar ao Menu Iniciar",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = true,
                Location = new Point(25, 185),
                Size = new Size(480, 25)
            };
            this.Controls.Add(chkStartMenu);

            chkAutoRun = new CheckBox
            {
                Text = "Inicializar o RemoteX automaticamente com o Windows",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(15, 23, 42),
                Checked = false,
                Location = new Point(25, 215),
                Size = new Size(480, 25)
            };
            this.Controls.Add(chkAutoRun);

            progressBar = new ProgressBar
            {
                Location = new Point(25, 260),
                Size = new Size(515, 18),
                Visible = false
            };
            this.Controls.Add(progressBar);

            statusLabel = new Label
            {
                Text = "",
                Font = new Font("Segoe UI", 9, FontStyle.Regular),
                ForeColor = Color.FromArgb(22, 163, 74),
                Location = new Point(25, 285),
                Size = new Size(515, 25)
            };
            this.Controls.Add(statusLabel);

            // Button Panel
            buttonPanel = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 55,
                BackColor = Color.FromArgb(229, 231, 235)
            };
            this.Controls.Add(buttonPanel);

            btnCancel = new Button
            {
                Text = "Cancelar",
                Size = new Size(100, 34),
                Location = new Point(335, 11),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                BackColor = Color.White,
                FlatStyle = FlatStyle.System
            };
            btnCancel.Click += (s, e) => this.Close();
            buttonPanel.Controls.Add(btnCancel);

            btnInstall = new Button
            {
                Text = "Instalar Agora",
                Size = new Size(118, 34),
                Location = new Point(445, 11),
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                BackColor = Color.FromArgb(0, 102, 243),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += async (s, e) => await PerformInstallAsync(rootDir);
            buttonPanel.Controls.Add(btnInstall);
        }

        private async Task PerformInstallAsync(string rootDir)
        {
            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            progressBar.Visible = true;
            progressBar.Value = 20;
            statusLabel.Text = "Preparando instalacao do RemoteX...";

            await Task.Delay(400);
            progressBar.Value = 50;
            statusLabel.Text = "Configurando motor nativo e atalhos oficiais...";

            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "RemoteX");
            string iconPath = Path.Combine(rootDir, @"assets\icon.ico");
            string vbsLauncher = Path.Combine(rootDir, "RemoteX.vbs");

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
                            sc.WorkingDirectory = rootDir;
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
                            sc2.WorkingDirectory = rootDir;
                            sc2.Description = "RemoteX - Plataforma de Acesso Remoto";
                            sc2.IconLocation = $"{iconPath}, 0";
                            sc2.Save();
                        }
                    }
                }

                if (chkAutoRun.Checked)
                {
                    using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                    {
                        key?.SetValue("RemoteX", $"wscript.exe \"{vbsLauncher}\"");
                    }
                }
            });

            progressBar.Value = 100;
            statusLabel.Text = "✓ Instalacao concluida com sucesso!";

            btnInstall.Text = "Abrir RemoteX";
            btnInstall.Enabled = true;
            btnInstall.Click -= null;
            btnInstall.Click += (s, e) =>
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "wscript.exe",
                    Arguments = $"\"{vbsLauncher}\"",
                    WorkingDirectory = rootDir
                });
                this.Close();
            };
        }
    }
}
