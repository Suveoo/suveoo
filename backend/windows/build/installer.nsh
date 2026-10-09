; Suveoo for Windows — NSIS 定制：suveoo:// 深链协议注册（HKCU 用户级，免管理员）
!macro customInstall
  ; 第一百六十轮终六：AUMID 注册表项——Windows 解析 Toast/任务栏归属时读
  ; HKCU\Classes\AppUserModelId\{AUMID} 的 DisplayName/IconUri；
  ; 仅有 setAppUserModelId 而无此键时，通知中心图标与应用名兜底显示 Electron（队长 3.185.0 实测）。
  WriteRegExpandStr HKCU "Software\Classes\AppUserModelId\com.suveoo.app" "DisplayName" "Suveoo"
  WriteRegExpandStr HKCU "Software\Classes\AppUserModelId\com.suveoo.app" "IconUri" "$INSTDIR\resources\icon.ico"
  WriteRegStr HKCU "Software\Classes\suveoo" "" "URL:Suveoo Protocol"
  WriteRegStr HKCU "Software\Classes\suveoo" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\suveoo\DefaultIcon" "" "$INSTDIR\Suveoo.exe,0"
  WriteRegStr HKCU "Software\Classes\suveoo\shell\open\command" "" '"$INSTDIR\Suveoo.exe" "%1"'
  ; 第一百六十轮终八（P0 回撤）：曾在此处 taskkill explorer + 重启以刷新品牌缓存——队长实测
  ; 在其机器上重启失败致桌面全黑/Explorer 消失（本机通过纯属侥幸）。已彻底移除：
  ; 品牌缓存改为"自然自愈"——注册表已为 REG_EXPAND_SZ，注销/重启/Explorer 重启后即显示 Suveoo。
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\suveoo"
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.suveoo.app"
  ; 卸载全程留痕（%TEMP%\suveoo-uninstall-trace.txt）——升级链排障用（队长实测弹窗根因排查期加入）
  nsExec::Exec `"$SYSDIR\cmd.exe" /c echo [%DATE% %TIME%] un.install end reached>>"%TEMP%\suveoo-uninstall-trace.txt"`
!macroend

; 第一百六十轮终二：整体替换模板的文件移除块（!ifmacrodef customRemoveFiles 钩子）。
; 原块的 atomicRMDir（把旧文件 rename 进 $PLUGINSDIR\old-install）失败即 Abort → 卸载器退出码 2
; → 新安装器 installUtil 重试 5 次全败 → 弹 "Suveoo cannot be closed"（队长实测升级卡点根因）。
; 替换为直删（RMDir /r ×2）：被锁文件只会残留、不会 Abort；配合 customCheckAppRunning 的
; 双杀 + 1.2s 句柄释放窗，正常路径零残留零弹窗。
!macro customRemoveFiles
  nsExec::Exec `"$SYSDIR\cmd.exe" /c echo [%DATE% %TIME%] customRemoveFiles begin>>"%TEMP%\suveoo-uninstall-trace.txt"`
  RMDir /r "$INSTDIR"
  Sleep 400
  RMDir /r "$INSTDIR"
  nsExec::Exec `"$SYSDIR\cmd.exe" /c echo [%DATE% %TIME%] customRemoveFiles end>>"%TEMP%\suveoo-uninstall-trace.txt"`
!macroend

; 第一百五十九轮：整体替换 electron-builder 的 CHECK_APP_RUNNING（安装/卸载段都会插入）。
; 原逻辑：安装器不带 /updated 参数（shell.openPath 无法传参）→ 发现 Suveoo.exe 在跑就弹
; "请关闭应用"对话框（队长实测更新链卡点）；且壳的关窗=驻留语义使优雅 taskkill 无效，
; 原模板只能靠重试弹窗。替换为：静默强杀当前用户名下全部 Suveoo.exe（含 GPU/渲染等
; 同名子进程与前次会话僵尸实例），无任何用户交互——更新安装与手动安装统一此语义。
!macro customCheckAppRunning
  DetailPrint `Closing running "${PRODUCT_NAME}"...`
  ; 第一百六十轮终二：确定性双杀 + 句柄释放窗（无循环无栈操作——曾试 tasklist 验证循环，
  ; ExecToStack 栈错位可致 $R1 被吃、计数永不到位而无限循环（/S 安装卡死实测））。
  ; 杀两次覆盖子进程级联与 AV 延迟退出；再静置 1.2s 等文件句柄释放——本宏位于
  ; uninstallOldVersion 之前（installSection.nsh 顺序），确保旧卸载器 rename 不遇锁。
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  Sleep 600
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  Sleep 1200
!macroend
