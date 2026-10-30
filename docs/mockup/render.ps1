# Renders the README mockups to PNG with a headless browser.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File docs/mockup/render.ps1

param(
	[string]$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$ErrorActionPreference = "Continue"

Add-Type -AssemblyName System.Drawing

function Trim-Bottom {
	param([string]$Path)

	$bytes = [System.IO.File]::ReadAllBytes($Path)
	$stream = New-Object System.IO.MemoryStream (,$bytes)
	$image = [System.Drawing.Image]::FromStream($stream)
	try {
		$bitmap = New-Object System.Drawing.Bitmap $image
		try {
			$height = $bitmap.Height
			$width = $bitmap.Width

			# Background colour of the bottom-left pixel.
			$background = $bitmap.GetPixel(0, $height - 1).ToArgb()

			$last = 0
			for ($y = $height - 1; $y -ge 0; $y--) {
				$rowHasContent = $false
				for ($x = 0; $x -lt $width; $x++) {
					if ($bitmap.GetPixel($x, $y).ToArgb() -ne $background) {
						$rowHasContent = $true
						break
					}
				}
				if ($rowHasContent) {
					$last = $y
					break
				}
			}

			$target = [Math]::Min($last + 1 + 24, $height)
			if ($target -ge $height) {
				return
			}

			$cropped = $bitmap.Clone(
				(New-Object System.Drawing.Rectangle 0, 0, $width, $target),
				$bitmap.PixelFormat
			)
			try {
				$temp = "$Path.trim"
				$cropped.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
				$cropped.Dispose()
				$cropped = $null
				[System.IO.File]::Copy($temp, $Path, $true)
				Remove-Item $temp -Force
			}
			finally {
				if ($cropped) { $cropped.Dispose() }
			}
		}
		finally {
			$bitmap.Dispose()
		}
	}
	finally {
		$image.Dispose()
		$stream.Dispose()
	}
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$mockup = Join-Path $root "docs\mockup"
$out = Join-Path $root "docs\images"

New-Item -ItemType Directory -Force -Path $out | Out-Null

$pages = @(
	@{ Name = "workbench"; Width = 900 },
	@{ Name = "settings"; Width = 1280 },
	@{ Name = "inline-modal"; Width = 760 }
)

$index = Join-Path $mockup "index.html"

foreach ($page in $pages) {
	$target = Join-Path $out "$($page.Name).png"

	if (Test-Path $target) {
		Remove-Item $target -Force
	}

	# Render tall, then trim the empty space below the content.
	$url = "file:///$($index -replace '\\', '/')?scene=$($page.Name)"
	$arguments = @(
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		"--force-device-scale-factor=2",
		"--window-size=$($page.Width),5000",
		"--virtual-time-budget=4000",
		"--screenshot=$target",
		$url
	)

	$ErrorActionPreference = "SilentlyContinue"
	& $Chrome @arguments 2>&1 | Out-Null
	$ErrorActionPreference = "Continue"

	if (-not (Test-Path $target)) {
		throw "Chrome did not produce $target"
	}

	Trim-Bottom -Path $target

	Write-Output "Rendered $target"
}
