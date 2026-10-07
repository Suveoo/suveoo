; Suveoo for Windows — NSIS 定制：suveoo:// 深链协议注册（HKCU 用户级，免管理员）
!macro customInstall
  WriteRegStr HKCU "Software\Classes\suveoo" "" "URL:Suveoo Protocol"
  WriteRegStr HKCU "Software\Classes\suveoo" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\suveoo\DefaultIcon" "" "$INSTDIR\Suveoo.exe,0"
  WriteRegStr HKCU "Software\Classes\suveoo\shell\open\command" "" '"$INSTDIR\Suveoo.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\suveoo"
!macroend
