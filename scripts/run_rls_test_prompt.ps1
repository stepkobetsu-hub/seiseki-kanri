$ErrorActionPreference = "Stop"

$env:SUPABASE_URL = "https://lrairqewdnyfxrydirrm.supabase.co"
$env:SUPABASE_ANON_KEY = "sb_publishable__bxvBBcx8LJoCqiPrfnnTg_0x3m8t6z"

$env:ADMIN_EMAIL = Read-Host "Admin email"
$securePassword = Read-Host "Admin password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

$nodeExe = 'C:\Users\kk898\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$testScript = Join-Path $PSScriptRoot 'test_supabase_rls.mjs'
& $nodeExe $testScript

$env:ADMIN_PASSWORD = ""
