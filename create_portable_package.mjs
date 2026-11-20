import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROJECT_DIR = 'c:\\Users\\André\\projetos com IA\\RemoteX';
const DIST_DIR = path.join(PROJECT_DIR, 'dist');
const STAGING_DIR = path.join(os.tmpdir(), 'remotex_pkg_stage');
const ISS_PATH = path.join(os.tmpdir(), 'remotex_installer.iss');
const ISCC_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe');

console.log('[1/5] Compilando assistente grafico C# (Instalar RemoteX.exe)...');
try {
  execFileSync('dotnet', ['build', path.join(PROJECT_DIR, 'installer', 'RemoteXSetup'), '-c', 'Release'], { stdio: 'inherit' });
  const builtSetupExe = path.join(PROJECT_DIR, 'installer', 'RemoteXSetup', 'bin', 'Release', 'net8.0-windows', 'Instalar RemoteX.exe');
  const builtSetupPdb = path.join(PROJECT_DIR, 'installer', 'RemoteXSetup', 'bin', 'Release', 'net8.0-windows', 'Instalar RemoteX.pdb');
  if (fs.existsSync(builtSetupExe)) {
    fs.copyFileSync(builtSetupExe, path.join(PROJECT_DIR, 'Instalar RemoteX.exe'));
  }
  if (fs.existsSync(builtSetupPdb)) {
    fs.copyFileSync(builtSetupPdb, path.join(PROJECT_DIR, 'Instalar RemoteX.pdb'));
  }
} catch (e) {
  console.warn('Aviso ao compilar RemoteXSetup:', e.message);
}

console.log('[2/5] Preparando pasta de staging limpa...');
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

const EXCLUDED_DIRS = new Set(['.git', 'dist', 'electron', '.cache']);

function copyFilteredDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFilteredDir(srcPath, destPath);
    } else if (entry.isFile()) {
      if (/\.(d\.ts|map)$/i.test(entry.name)) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dirName of ['apps', 'assets', 'services', 'native', 'installer']) {
  copyFilteredDir(path.join(PROJECT_DIR, dirName), path.join(STAGING_DIR, dirName));
}

for (const file of [
  'Instalar RemoteX.exe',
  'RemoteX.vbs',
  'Instalar RemoteX.vbs',
  'Desinstalar RemoteX.vbs',
  'setup_wizard.ps1',
  'uninstall.ps1',
  'start-remotex.ps1',
  'package.json',
  'README.md',
  'icon.ico'
]) {
  const srcFile = path.join(PROJECT_DIR, file);
  if (fs.existsSync(srcFile)) {
    fs.copyFileSync(srcFile, path.join(STAGING_DIR, file));
  }
}

// Embutir node.exe portatil igual ao DocFlow AI para zero dependencia em outros PCs
const nodeCandidates = [
  'C:\\Users\\André\\Desktop\\Nova pasta\\dockflor\\node.exe',
  process.execPath
];
for (const cand of nodeCandidates) {
  if (cand && fs.existsSync(cand)) {
    console.log(`      Embutindo node.exe portatil de: ${cand}`);
    fs.copyFileSync(cand, path.join(STAGING_DIR, 'node.exe'));
    break;
  }
}

// 3. Gerar RemoteX-Instalador.zip compativel com Windows Explorer
const zipOut = path.join(DIST_DIR, 'RemoteX-Instalador.zip');
if (fs.existsSync(zipOut)) fs.unlinkSync(zipOut);
console.log('[3/5] Gerando RemoteX-Instalador.zip...');
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${STAGING_DIR}', '${zipOut}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`
  ],
  { stdio: 'inherit' }
);
const zipSizeMb = (fs.statSync(zipOut).size / (1024 * 1024)).toFixed(2);
console.log(`      ZIP criado com sucesso: ${zipOut} (${zipSizeMb} MB)`);

// 4. Compilar RemoteX-Instalador.exe com Inno Setup 6 (mesmo padrao do DocFlow AI)
console.log('[4/5] Compilando RemoteX-Instalador.exe com Inno Setup 6...');
const issContent = [
  '[Setup]',
  'AppId={{9F4E7C1A-6B3D-48E9-A12C-5D8F30B91E42}',
  'AppName=RemoteX',
  'AppVersion=1.1.0',
  'AppPublisher=RemoteX',
  'DefaultDirName=C:\\RemoteX\\system',
  'AppendDefaultDirName=no',
  'UsePreviousAppDir=no',
  'DefaultGroupName=RemoteX',
  'DisableProgramGroupPage=yes',
  'PrivilegesRequired=lowest',
  'PrivilegesRequiredOverridesAllowed=dialog',
  `OutputDir=${DIST_DIR}`,
  'OutputBaseFilename=RemoteX-Instalador',
  `SetupIconFile=${path.join(STAGING_DIR, 'icon.ico')}`,
  'UninstallDisplayIcon={app}\\icon.ico',
  'Compression=lzma2/fast',
  'SolidCompression=yes',
  'WizardStyle=modern',
  'CloseApplications=no',
  '',
  '[Languages]',
  'Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\\BrazilianPortuguese.isl"',
  '',
  '[Dirs]',
  'Name: "{app}"; Permissions: users-modify',
  '',
  '[Files]',
  `Source: "${STAGING_DIR}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs`,
  '',
  '[Icons]',
  'Name: "{autodesktop}\\RemoteX"; Filename: "wscript.exe"; Parameters: """{app}\\RemoteX.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\icon.ico"',
  'Name: "{autoprograms}\\RemoteX\\RemoteX"; Filename: "wscript.exe"; Parameters: """{app}\\RemoteX.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\icon.ico"',
  '',
  '[Run]',
  'Filename: "wscript.exe"; Parameters: """{app}\\RemoteX.vbs"""; WorkingDir: "{app}"; Description: "Iniciar o RemoteX agora"; Flags: nowait postinstall skipifsilent'
].join('\r\n');

fs.writeFileSync(ISS_PATH, issContent, 'utf8');
execFileSync(ISCC_EXE, [ISS_PATH], { stdio: 'inherit' });

const exeOut = path.join(DIST_DIR, 'RemoteX-Instalador.exe');
const exeSizeMb = (fs.statSync(exeOut).size / (1024 * 1024)).toFixed(2);
console.log(`[5/5] EXE Inno Setup criado com sucesso: ${exeOut} (${exeSizeMb} MB)`);

fs.rmSync(STAGING_DIR, { recursive: true, force: true });
