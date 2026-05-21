#!/usr/bin/env python3
"""删除 Cloudflare 上 *.chipgo.net 指向旧 IP 的 A 记录。"""
import base64
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

ZONE = "chipgo.net"
TARGET_IPS = {"216.198.79.1", "64.29.17.1"}
API = "https://api.cloudflare.com/client/v4"


def load_token():
    env = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if env:
        return env, None
    cert = Path.home() / ".cloudflared" / "cert.pem"
    if not cert.exists():
        return None, None
    text = cert.read_text()
    m = re.search(r"ARGO TUNNEL TOKEN-----\n([A-Za-z0-9+/=\n]+)", text, re.S)
    if not m:
        return None, None
    data = json.loads(base64.b64decode("".join(m.group(1).split())))
    return data.get("apiToken"), data.get("zoneID")


def api(token, method, url):
    req = urllib.request.Request(
        url,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    token, zone_id = load_token()
    if not token:
        print("未找到凭证：请先 cloudflared tunnel login，或在 .env 设置 CLOUDFLARE_API_TOKEN")
        return 1

    if not zone_id:
        zones = api(token, "GET", f"{API}/zones?name={ZONE}")
        if not zones.get("success") or not zones["result"]:
            print("无法获取 zone id")
            return 1
        zone_id = zones["result"][0]["id"]

    recs = api(token, "GET", f"{API}/zones/{zone_id}/dns_records?type=A&per_page=100")
    if not recs.get("success"):
        print("列出记录失败", recs.get("errors"))
        return 1

    deleted = 0
    for rec in recs["result"]:
        name = rec["name"]
        content = rec["content"]
        short = name.replace(f".{ZONE}", "")
        is_wild = short == "*" or name.startswith("*.")
        if rec["type"] == "A" and is_wild and content in TARGET_IPS:
            out = api(
                token,
                "DELETE",
                f"{API}/zones/{zone_id}/dns_records/{rec['id']}",
            )
            ok = out.get("success")
            print(f"{'已删除' if ok else '失败'}: {name} -> {content}")
            if ok:
                deleted += 1

    print(f"完成，共删除 {deleted} 条。请刷新 Cloudflare DNS 页面。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
