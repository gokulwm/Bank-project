Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Smart Banking Kiosk - Service Health & Port Checker" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$services = @(
    @{ Name = "1. Backend Core FSM";       Port = 8000; Url = "http://localhost:8000/docs" },
    @{ Name = "2. Face Auth Service";      Port = 8002; Url = "http://localhost:8002/health" },
    @{ Name = "3. Vernacular Voice AI";    Port = 8200; Url = "http://localhost:8200/health" },
    @{ Name = "4. Security QR Service";    Port = 8105; Url = "http://localhost:8105/health" },
    @{ Name = "5. Customer Kiosk UI";      Port = 5173; Url = "http://localhost:5173" },
    @{ Name = "6. Staff / Teller Portal";  Port = 5174; Url = "http://localhost:5174" }
)

foreach ($svc in $services) {
    $portOpen = $false
    $httpStatus = "Offline"
    
    # Check TCP port
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $svc.Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(500, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $portOpen = $true
        }
        $tcp.Close()
    } catch {
        $portOpen = $false
    }

    if ($portOpen) {
        Write-Host " [ONLINE] " -ForegroundColor Green -NoNewline
        Write-Host "$($svc.Name) (Port $($svc.Port)) -> $($svc.Url)" -ForegroundColor White
    } else {
        Write-Host " [OFFLINE] " -ForegroundColor Red -NoNewline
        Write-Host "$($svc.Name) (Port $($svc.Port)) -> Not responding" -ForegroundColor DarkGray
    }
}

Write-Host "`n--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "PORTAL LINKS FOR MANUAL TESTING:" -ForegroundColor Cyan
Write-Host " - Face Enrollment Portal:  http://localhost:8002/face-auth/enroll" -ForegroundColor Yellow
Write-Host " - Customer Kiosk UI:       http://localhost:5173" -ForegroundColor Yellow
Write-Host " - Staff Portal Dashboard:  http://localhost:5174" -ForegroundColor Yellow
Write-Host " - Face Verification Tool:  http://localhost:8002/face-auth/verify" -ForegroundColor Yellow
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
