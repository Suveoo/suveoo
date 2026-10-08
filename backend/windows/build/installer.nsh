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

; 第一百五十九轮：整体替换 electron-builder 的 CHECK_APP_RUNNING（安装/卸载段都会插入）。
; 原逻辑：安装器不带 /updated 参数（shell.openPath 无法传参）→ 发现 Suveoo.exe 在跑就弹
; "请关闭应用"对话框（队长实测更新链卡点）；且壳的关窗=驻留语义使优雅 taskkill 无效，
; 原模板只能靠重试弹窗。替换为：静默强杀当前用户名下全部 Suveoo.exe（含 GPU/渲染等
; 同名子进程与前次会话僵尸实例），无任何用户交互——更新安装与手动安装统一此语义。
!macro customCheckAppRunning
  DetailPrint `Closing running "${PRODUCT_NAME}"...`
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  Sleep 400
!macroend
