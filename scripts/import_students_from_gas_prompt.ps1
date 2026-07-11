$ErrorActionPreference = "Stop"

$env:GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec"
$env:SUPABASE_URL = "https://lrairqewdnyfxrydirrm.supabase.co"
$env:SUPABASE_ANON_KEY = "sb_publishable__bxvBBcx8LJoCqiPrfnnTg_0x3m8t6z"

$mode = Read-Host "Mode: 1=dry run, 2=import"
if ($mode -eq "2") {
  $env:DRY_RUN = "0"
} else {
  $env:DRY_RUN = "1"
}

$env:ADMIN_EMAIL = Read-Host "Admin email"
$securePassword = Read-Host "Admin password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$nodeExe = 'C:\Users\kk898\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$importScript = Join-Path $PSScriptRoot 'import_students_from_gas_to_supabase.mjs'
& $nodeExe $importScript

$env:ADMIN_PASSWORD = ""
