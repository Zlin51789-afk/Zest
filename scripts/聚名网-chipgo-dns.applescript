-- 在 Safari 已登录聚名网且开启「允许来自 Apple 事件的 JavaScript」后运行：
--   osascript scripts/聚名网-chipgo-dns.applescript

set vercelIp to "76.76.21.21"
set ns1 to "ns1.vercel-dns.com"
set ns2 to "ns2.vercel-dns.com"

tell application "Safari"
	activate
	set jTab to missing value
	repeat with w in windows
		repeat with t in tabs of w
			if (URL of t) contains "juming.com/user" then
				set jTab to t
				exit repeat
			end if
		end repeat
		if jTab is not missing value then exit repeat
	end repeat
	if jTab is missing value then
		set jTab to make new tab at end of tabs of front window
		set URL of jTab to "https://www.juming.com/user/#/admin_ym"
		delay 2
	end if

	tell jTab
		set URL to "https://www.juming.com/user/#/admin_ym"
		delay 2
		set js to "
(function(){
  const ip = '" & vercelIp & "';
  const body = document.body.innerText || '';
  if (!body.includes('chipgo')) {
    return JSON.stringify({ ok:false, step:'find-domain', hint:'页面上未找到 chipgo.net，请手动打开该域名的「管理」' });
  }
  const clickText = (txt) => {
    const els = [...document.querySelectorAll('a,button,span,div,td')];
    const el = els.find(e => (e.innerText||'').trim() === txt || (e.innerText||'').includes(txt));
    if (el) { el.click(); return true; }
    return false;
  };
  if (clickText('chipgo.net') || clickText('chipgo')) {}
  return JSON.stringify({ ok:true, step:'opened', sample: body.slice(0, 800) });
})()
"
		try
			set res to do JavaScript js
			return res
		on error errMsg number errNum
			if errNum is 8 then
				return "请先在 Safari：设置 → 高级 → 显示开发菜单；再点菜单栏「开发」→ 勾选「允许来自 Apple 事件的 JavaScript」，然后重新运行本脚本。"
			end if
			return "错误: " & errMsg
		end try
	end tell
end tell
