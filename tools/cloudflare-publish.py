"""Publish only Lavía through the existing remotely managed tunnel.

Credentials stay outside the repository. Existing DNS records/routes are never
overwritten; a private snapshot records the previous configuration.
"""
import base64
import copy
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

HOST = "lavia.eav-labs.com"
ORIGIN = "http://127.0.0.1:8130"
ROOT = Path(__file__).resolve().parent.parent
key = Path(os.environ.get("CLOUDFLARE_TOKEN_FILE", str(Path.home() / ".config/cloudflare/api-token"))).read_text().strip()
connector = json.loads(base64.b64decode(Path("/home/ernesto/apps/cloudflare-tunnel/tunnel-token").read_text().strip()))
account, tunnel = connector["a"], connector["t"]


def api(path, method="GET", body=None):
    request = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Cloudflare {method} {path}: HTTP {error.code}") from None
    if not data.get("success"):
        raise RuntimeError("Cloudflare rejected request: " + json.dumps(data.get("errors")))
    return data["result"]


zones = api("/zones?name=eav-labs.com")
assert len(zones) == 1 and zones[0]["account"]["id"] == account, "Unexpected zone/account"
zone = zones[0]["id"]
route_path = f"/accounts/{account}/cfd_tunnel/{tunnel}/configurations"
before = api(route_path)
config = copy.deepcopy(before["config"])
ingress = config["ingress"]
assert ingress and not ingress[-1].get("hostname"), "Missing final catch-all"
matches = [route for route in ingress if route.get("hostname") == HOST]
assert not matches or (len(matches) == 1 and matches[0].get("service") == ORIGIN and not matches[0].get("path")), "Existing conflicting tunnel route"
records_path = f"/zones/{zone}/dns_records"
records = api(records_path + "?name=" + HOST)
target = tunnel + ".cfargotunnel.com"
assert not records or (len(records) == 1 and records[0]["type"] == "CNAME" and records[0]["content"] == target and records[0]["proxied"]), "Existing conflicting DNS record"
snapshot = ROOT / ".local" / "cloudflare-publication-before.json"
if not snapshot.exists():
    snapshot.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with snapshot.open("x") as file:
        json.dump({"tunnel": before, "dns": records}, file)
    snapshot.chmod(0o600)
if not matches:
    ingress.insert(-1, {"hostname": HOST, "service": ORIGIN, "originRequest": {}})
    assert api(route_path)["config"] == before["config"], "Tunnel changed concurrently; retry"
    api(route_path, "PUT", {"config": config})
    print("Tunnel route added; existing routes preserved")
if not records:
    api(records_path, "POST", {"type": "CNAME", "name": HOST, "content": target, "proxied": True, "ttl": 1})
    print("Proxied DNS record created")
assert api(route_path)["config"] == config, "Tunnel configuration verification failed"
assert api(records_path + "?name=" + HOST)[0]["content"] == target
print("Verified https://" + HOST)
