<#
.SYNOPSIS
    一键把本目录发布为 GitHub 仓库，并开启 GitHub Pages。

.DESCRIPTION
    只依赖 PowerShell 5.1+，不需要安装 git。
    通过 GitHub REST API 创建公开仓库、一次性提交全部文件、开启 Pages。

.EXAMPLE
    .\publish.ps1 -Token ghp_xxxxxxxx

.EXAMPLE
    .\publish.ps1 -Token ghp_xxxxxxxx -RepoName my-typing-test -Private

.NOTES
    Token 需要 repo + workflow 两个 scope（classic token）。
    Token 只在本次进程内存中使用，不会写入任何文件。
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = 'GitHub Personal Access Token (ghp_...)')]
    [string]$Token,

    [string]$RepoName = 'typeflow',

    [string]$Description = 'TypeFlow - a minimal typing speed test (zero dependencies)',

    [switch]$Private,

    [switch]$SkipPages
)

$ErrorActionPreference = 'Stop'
$Api = 'https://api.github.com'
$Headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = 'application/vnd.github+json'
    'User-Agent'           = 'typeflow-publish'
    'X-GitHub-Api-Version' = '2022-11-28'
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body,
        [switch]$AllowFail
    )
    $params = @{
        Method      = $Method
        Uri         = "$Api$Path"
        Headers     = $Headers
        ContentType = 'application/json; charset=utf-8'
        ErrorAction = 'Stop'
    }
    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 12 -Compress
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    try {
        Invoke-RestMethod @params
    }
    catch {
        if ($AllowFail) { return $null }
        $detail = $_.ErrorDetails.Message
        throw ("GitHub API $Method $Path failed: $($_.Exception.Message)`n$detail")
    }
}

function New-Commit {
    param([array]$Items, [string]$Message, [string]$ParentSha)

    $tree = Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/git/trees" -Body @{ tree = $Items }

    $commitBody = @{ message = $Message; tree = $tree.sha }
    if ($ParentSha) { $commitBody.parents = @($ParentSha) } else { $commitBody.parents = @() }
    $commit = Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/git/commits" -Body $commitBody

    if ($ParentSha) {
        Invoke-Api -Method PATCH -Path "/repos/$($repo.full_name)/git/refs/heads/main" -Body @{
            sha   = $commit.sha
            force = $true
        } | Out-Null
    }
    else {
        Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/git/refs" -Body @{
            ref = 'refs/heads/main'
            sha = $commit.sha
        } | Out-Null
    }
    return $commit
}

# ---------- 0. verify token ----------
Write-Host '-> Checking token ...' -ForegroundColor Cyan
$me = Invoke-Api -Method GET -Path '/user'
Write-Host "   Signed in as: $($me.login)" -ForegroundColor Green

# ---------- 1. collect files ----------
$root = $PSScriptRoot
$files = Get-ChildItem -Path $root -Recurse -File -Force |
    Where-Object {
        $rel = $_.FullName.Substring($root.Length + 1)
        $rel -notmatch '\\\.git\\' -and
        $rel -notmatch '\.zip$' -and
        $rel -notmatch 'node_modules' -and
        $rel -notmatch '(?i)(desktop\.ini|thumbs\.db|\.DS_Store)$'
    } |
    Sort-Object FullName

if (-not $files) { throw "No files to publish in: $root" }
Write-Host "-> $($files.Count) files to publish" -ForegroundColor Cyan

# ---------- 2. create repo ----------
Write-Host "-> Creating repo $($me.login)/$RepoName ..." -ForegroundColor Cyan
$repo = Invoke-Api -Method POST -Path '/user/repos' -Body @{
    name        = $RepoName
    description = $Description
    private     = [bool]$Private
    auto_init   = $false
    has_issues  = $true
    has_wiki    = $false
} -AllowFail

if (-not $repo) {
    Write-Host '   repo exists, reusing it' -ForegroundColor Yellow
    $repo = Invoke-Api -Method GET -Path "/repos/$($me.login)/$RepoName"
}
Write-Host "   $($repo.html_url)" -ForegroundColor Green

# ---------- 3. ensure there is a base commit ----------
$parentSha = $null
$refInfo = Invoke-Api -Method GET -Path "/repos/$($repo.full_name)/git/ref/heads/main" -AllowFail
if ($refInfo) {
    $parentSha = $refInfo.object.sha
}
else {
    Write-Host '-> Seeding empty repo ...' -ForegroundColor Cyan
    $seed = Invoke-Api -Method PUT -Path "/repos/$($repo.full_name)/contents/README.md" -Body @{
        message = 'chore: init'
        content = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("# $RepoName`n"))
    }
    $parentSha = $seed.commit.sha
    $db = (Invoke-Api -Method GET -Path "/repos/$($repo.full_name)").default_branch
    if ($db -and $db -ne 'main') {
        Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/branches/$db/rename" -Body @{ new_name = 'main' } | Out-Null
        Write-Host "   renamed branch $db -> main" -ForegroundColor Yellow
    }
}

# ---------- 4. upload blobs ----------
Write-Host '-> Uploading files ...' -ForegroundColor Cyan
$entries = @()
foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1) -replace '\\', '/'
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
    $blob = Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/git/blobs" -Body @{
        content  = $b64
        encoding = 'base64'
    }
    $entries += @{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha }
    Write-Host "   + $rel"
}

# ---------- 5. commit ----------
Write-Host '-> Creating commit ...' -ForegroundColor Cyan
$commitMessage = "feat: TypeFlow typing speed test`n`nZero-dependency single-page typing test: live WPM / accuracy, per-character colouring, three text modes, localStorage personal bests, light/dark theme."
$workflowSkipped = $false
try {
    $commit = New-Commit -Items $entries -Message $commitMessage -ParentSha $parentSha
}
catch {
    if ($entries.path -match '^\.github/') {
        Write-Host '   token lacks workflow scope, retrying without .github/' -ForegroundColor Yellow
        $workflowSkipped = $true
        $rest = $entries | Where-Object { $_.path -notlike '.github/*' }
        $commit = New-Commit -Items $rest -Message $commitMessage -ParentSha $parentSha
    }
    else { throw }
}
Write-Host "   commit $($commit.sha.Substring(0,7))" -ForegroundColor Green

# ---------- 6. enable Pages ----------
if (-not $SkipPages) {
    Write-Host '-> Enabling GitHub Pages ...' -ForegroundColor Cyan
    $pagesBody = if ($workflowSkipped) {
        @{ build_type = 'legacy'; source = @{ branch = 'main'; path = '/' } }
    }
    else {
        @{ build_type = 'workflow' }
    }
    $pages = Invoke-Api -Method POST -Path "/repos/$($repo.full_name)/pages" -Body $pagesBody -AllowFail
    if (-not $pages) {
        $pages = Invoke-Api -Method PUT -Path "/repos/$($repo.full_name)/pages" -Body $pagesBody -AllowFail
    }
    if ($pages) { Write-Host "   Pages: $($pages.html_url)" -ForegroundColor Green }
    else { Write-Host '   auto-enable failed, enable it in Settings -> Pages' -ForegroundColor Yellow }
}

# ---------- 7. summary ----------
Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
Write-Host "Repo:  $($repo.html_url)"
if (-not $Private) { Write-Host "Pages: https://$($me.login).github.io/$RepoName/" }
