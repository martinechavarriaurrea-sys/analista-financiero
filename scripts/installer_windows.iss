; Requires Inno Setup 6+
[Setup]
AppName=Analizador de Empresas (Supersociedades)
AppVersion=1.0.0
DefaultDirName={userdesktop}\AnalizadorEmpresasSupersociedades
DefaultGroupName=AnalizadorEmpresasSupersociedades
OutputDir=dist
OutputBaseFilename=Instalador_AnalizadorEmpresasSupersociedades
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\AnalizadorEmpresasSupersociedades.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userdesktop}\Analizador Empresas (Supersociedades)"; Filename: "{app}\AnalizadorEmpresasSupersociedades.exe"
Name: "{group}\Analizador Empresas (Supersociedades)"; Filename: "{app}\AnalizadorEmpresasSupersociedades.exe"

[Run]
Filename: "{app}\AnalizadorEmpresasSupersociedades.exe"; Description: "Ejecutar Analizador de Empresas"; Flags: nowait postinstall skipifsilent
