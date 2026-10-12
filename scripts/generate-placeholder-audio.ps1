param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\audio')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Speech

$clips = [ordered]@{
  'training-prepare.wav'       = '坐稳，保持自然呼吸'
  'training-contract.wav'      = '轻轻上提'
  'training-hold.wav'          = '保持'
  'training-release.wav'       = '慢慢松开'
  'training-rest.wav'          = '完全放松'
  'training-reprepare.wav'     = '重新坐好'
  'training-complete.wav'      = '完成，放松'
  'training-anal-contract.wav' = '轻轻收住'
  'posture-connection.wav'     = '检查连接和坐垫接触，再试一次。'
  'posture-adjusting.wav'      = '先坐稳，保持两秒，我们再观察。'
  'posture-left.wav'           = '双脚放稳，身体轻轻向右调整，让两侧支撑更均衡。'
  'posture-right.wav'          = '双脚放稳，身体轻轻向左调整，让两侧支撑更均衡。'
  'posture-back.wav'           = '检查腰枕位置，身体轻轻后靠，获得舒服的腰部支撑。'
  'posture-balanced.wav'       = '当前支撑接近你的舒适参考，可以保持舒服，自然呼吸。'
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$synthesizer = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $voice = $synthesizer.GetInstalledVoices() |
    Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } |
    Select-Object -First 1
  if (-not $voice) {
    throw 'No installed zh-CN Windows speech voice was found.'
  }

  $synthesizer.SelectVoice($voice.VoiceInfo.Name)
  $synthesizer.Rate = 1
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
  )

  foreach ($entry in $clips.GetEnumerator()) {
    $path = Join-Path $OutputDirectory $entry.Key
    $synthesizer.SetOutputToWaveFile($path, $format)
    $synthesizer.Speak($entry.Value)
    $synthesizer.SetOutputToNull()
  }
}
finally {
  $synthesizer.Dispose()
}
