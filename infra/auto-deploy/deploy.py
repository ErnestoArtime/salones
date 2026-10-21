#!/usr/bin/env python3
"""Pull-only, serialized releases for the existing Lavía Compose deployment."""
import argparse
import copy
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import time
import urllib.request

REPOSITORY = "git@github.com:ErnestoArtime/salones.git"
PROJECT = "lavia"
WRITERS = ["web", "api", "auth", "rest", "storage"]
INFRA = ["db", "auth", "rest", "storage", "mail"]
PERSISTENT = {"db": {"/var/lib/postgresql/data", "/etc/postgresql-custom"}, "storage": {"/var/lib/storage"}, "mail": {"/data"}}


def run(args, *, cwd=None, env=None, capture=False):
    return subprocess.check_output(args, cwd=cwd, env=env) if capture else subprocess.check_call(args, cwd=cwd, env=env)


def atomic_json(path, data):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    temp.chmod(0o600)
    temp.replace(path)


def release_env(tag):
    env = dict(os.environ)
    env["IMAGE_TAG"] = tag
    return env


def compose(release, tag, *args, capture=False):
    return run(["docker", "compose", "--project-name", PROJECT, "--project-directory", str(release), "-f", str(release / "compose.yaml"), *args], cwd=release, env=release_env(tag), capture=capture)


def rendered(release, tag):
    return json.loads(compose(release, tag, "config", "--format", "json", capture=True))


def signature(config):
    """Stateful infrastructure changes require a separate operator upgrade.

    Bind sources vary by release, but their bytes must remain identical.
    Only digests are persisted; rendered config may contain secrets.
    """
    result = {}
    for name in INFRA:
        service = copy.deepcopy(config["services"][name])
        service.pop("labels", None)
        for mount in service.get("volumes", []):
            if mount["type"] == "bind":
                source = Path(mount["source"])
                if not source.is_file():
                    raise RuntimeError("Infrastructure bind mount must be a file")
                mount["source"] = hashlib.sha256(source.read_bytes()).hexdigest()
        result[name] = hashlib.sha256(json.dumps(service, sort_keys=True).encode()).hexdigest()
    return result


def persistent_mounts(config):
    result = {}
    for service, targets in PERSISTENT.items():
        for target in targets:
            mounts = [m for m in config["services"][service].get("volumes", []) if m["target"] == target]
            if len(mounts) != 1 or mounts[0]["type"] != "volume":
                raise RuntimeError("Persistent data must remain in the existing named volumes")
            volume = mounts[0]["source"]
            result[service + ":" + target] = config["volumes"][volume]["name"]
    return result


def live_mounts(release, tag):
    result = {}
    for service, targets in PERSISTENT.items():
        container = compose(release, tag, "ps", "-aq", service, capture=True).decode().strip()
        if not container:
            raise RuntimeError("Missing existing persistent service: " + service)
        mounts = json.loads(run(["docker", "inspect", "--format", "{{json .Mounts}}", container], capture=True))
        for target in targets:
            matches = [m for m in mounts if m["Destination"] == target and m["Type"] == "volume"]
            if len(matches) != 1:
                raise RuntimeError("Existing container has unexpected persistent mounts")
            result[service + ":" + target] = matches[0]["Name"]
    return result


def validate_candidate(config, approved, tag):
    if config["name"] != PROJECT or persistent_mounts(config) != approved["volumes"]:
        raise RuntimeError("Compose project or persistent volume mapping changed")
    if signature(config) != approved["infrastructure"]:
        raise RuntimeError("Stateful infrastructure configuration changed; upgrade it separately")
    for service, image in [("api", "lavia/api:"), ("migrate", "lavia/api:"), ("web", "lavia/web:")]:
        if config["services"][service]["image"] != image + tag:
            raise RuntimeError("Unexpected application image name")
    if config["services"]["web"].get("ports") != approved["web_ports"]:
        raise RuntimeError("Public listener mapping changed")


def migrations(release, tag):
    sql = "SELECT coalesce(json_agg(t ORDER BY name),'[]'::json) FROM (SELECT name,checksum FROM public.lavia_migrations) t"
    return json.loads(compose(release, tag, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql, capture=True))


def validate_migrations(release, applied):
    folder = release / "database/migrations"
    for row in applied:
        file = folder / row["name"]
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != row["checksum"]:
            raise RuntimeError("An applied migration was removed or modified: " + row["name"])
    last = max((r["name"] for r in applied), default="")
    names = {r["name"] for r in applied}
    if any(f.name <= last for f in folder.glob("*.sql") if f.name not in names):
        raise RuntimeError("New migrations must sort after the applied migrations")


def required_backup_space(release, tag, volumes):
    database = int(compose(release, tag, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-Atc", "SELECT pg_database_size('postgres')", capture=True))
    size = database
    for key in ["storage:/var/lib/storage", "db:/etc/postgresql-custom"]:
        output = run(["docker", "run", "--rm", "--network", "none", "--mount", "type=volume,src=" + volumes[key] + ",dst=/data,readonly", "busybox:1.37.0", "du", "-sk", "/data"], capture=True)
        size += int(output.split()[0]) * 1024
    return size * 2 + 4 * 1024**3


def recover(state):
    """After interruption, resume old code only when the schema is unchanged."""
    pending = state["in_progress"]
    old, tag = Path(state["release"]), state["tag"]
    try:
        compose(old, tag, "stop", *WRITERS)
        after = migrations(old, tag)
        if after == pending["before"]:
            smoke(old, tag, pending["http_port"])
            return "failed-rolled-back"
        return "failed-maintenance-schema-changed"
    except Exception:
        return "failed-maintenance"


def is_descendant(mirror, older, newer):
    return subprocess.run(["git", "--git-dir", str(mirror), "merge-base", "--is-ancestor", older, newer], check=False).returncode == 0


def prepare_release(root, config, sha):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise RuntimeError("Invalid release SHA")
    release = root / "releases" / sha
    if not release.exists():
        release.mkdir(parents=True, mode=0o700)
        try:
            archive = run(["git", "--git-dir", str(root / "repository.git"), "archive", sha], capture=True)
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
                tar.extractall(release, filter="data")
            for name, target in [(".env", config["env_file"]), (".local", config["workspace"] + "/.local"), ("backups", config["workspace"] + "/backups")]:
                if (release / name).exists() or (release / name).is_symlink():
                    raise RuntimeError("Private deployment paths must never be tracked")
                (release / name).symlink_to(target)
        except BaseException:
            shutil.rmtree(release)
            raise
    return release


def smoke(release, tag, port):
    compose(release, tag, "up", "-d", "--no-deps", "--wait", "--wait-timeout", "120", "auth", "rest", "storage", "api")
    compose(release, tag, "up", "-d", "--no-deps", "web")
    deadline = time.monotonic() + 45
    while True:
        try:
            for route in ["/api/health", "/booking/", "/admin/"]:
                with urllib.request.urlopen("http://127.0.0.1:" + str(port) + route, timeout=5) as response:
                    if response.status != 200:
                        raise RuntimeError("HTTP smoke failed")
            return
        except Exception:
            if time.monotonic() > deadline:
                raise RuntimeError("Application HTTP smoke checks failed") from None
            time.sleep(2)


def init(root, workspace):
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (root / "config.json").exists():
        raise RuntimeError("Deployment is already initialized; refusing to replace its state")
    workspace = workspace.resolve()
    env_file = workspace / ".env"
    if not env_file.is_file():
        raise RuntimeError("Existing production .env required; secrets are never generated here")
    remote = run(["git", "remote", "get-url", "origin"], cwd=workspace, capture=True).decode().strip()
    if remote != REPOSITORY:
        raise RuntimeError("Unexpected repository remote")
    run(["git", "clone", "--bare", REPOSITORY, str(root / "repository.git")])
    sha = run(["git", "rev-parse", "HEAD"], cwd=workspace, capture=True).decode().strip()
    config = {"workspace": str(workspace), "env_file": str(env_file), "repository": remote}
    release = prepare_release(root, config, sha)
    current = rendered(workspace, "0.1.0")
    volumes = persistent_mounts(current)
    if volumes != live_mounts(workspace, "0.1.0"):
        raise RuntimeError("Existing data volumes differ from the expected configuration")
    config["approved"] = {"volumes": volumes, "infrastructure": signature(current), "web_ports": current["services"]["web"].get("ports")}
    ports = current["services"]["web"]["ports"]
    if len(ports) != 1 or ports[0].get("host_ip") != "127.0.0.1":
        raise RuntimeError("Expected one loopback HTTP listener")
    config["http_port"] = ports[0]["published"]
    tag = "baseline-" + sha[:12]
    for service in ["api", "web"]:
        container = compose(workspace, "0.1.0", "ps", "-q", service, capture=True).decode().strip()
        image = run(["docker", "inspect", "--format", "{{.Image}}", container], capture=True).decode().strip()
        run(["docker", "image", "tag", image, "lavia/" + service + ":" + tag])
    validate_candidate(rendered(release, tag), config["approved"], tag)
    atomic_json(root / "config.json", config)
    atomic_json(root / "state.json", {"current_sha": sha, "release": str(release), "tag": tag, "status": "ready"})
    (workspace / ".local/auto-deploy.enabled").write_text(str(root) + "\n")
    print("Existing deployment adopted without restarting services: " + sha)


def check(root, retry=False):
    config = json.loads((root / "config.json").read_text())
    workspace = Path(config["workspace"])
    locks = []
    try:
        for name in ["deploy.lock", "backup.lock"]:
            file = (workspace / ".local" / name).open("a")
            locks.append(file)
            try:
                fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("Another deployment or backup is active; retry on next timer tick")
                return
        state = json.loads((root / "state.json").read_text())
        if "in_progress" in state:
            state["status"] = recover(state)
            state["failed_sha"] = state["in_progress"]["sha"]
            state["failed_stage"] = "interrupted"
            state.pop("in_progress")
            atomic_json(root / "state.json", state)
            print("Recovered interrupted deployment: " + state["status"], flush=True)
        mirror = root / "repository.git"
        run(["git", "--git-dir", str(mirror), "fetch", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"])
        sha = run(["git", "--git-dir", str(mirror), "rev-parse", "refs/remotes/origin/main"], capture=True).decode().strip()
        if sha == state["current_sha"]:
            print("Production already matches main: " + sha)
            return
        if sha == state.get("failed_sha") and not retry:
            print("This failed release is paused; push a fix or use check --retry: " + sha)
            return
        if not is_descendant(mirror, state["current_sha"], sha):
            raise RuntimeError("Refusing a rewritten/non-descendant main history")
        if shutil.disk_usage(root).free < 6 * 1024**3:
            raise RuntimeError("Less than 6 GB available; keep current production running")
        release = prepare_release(root, config, sha)
        logs = root / "logs"; logs.mkdir(exist_ok=True, mode=0o700)
        log = logs / (sha + ".log")
        print("Deploying main " + sha + "; private log: " + str(log), flush=True)
        with log.open("a", buffering=1) as out:
            log.chmod(0o600)
            # Child build/migration logs stay local, and never enter public CI logs.
            saved_out, saved_err = os.dup(1), os.dup(2)
            os.dup2(out.fileno(), 1); os.dup2(out.fileno(), 2)
            try:
                deploy(root, config, state, release, sha)
            finally:
                os.dup2(saved_out, 1); os.dup2(saved_err, 2)
                os.close(saved_out); os.close(saved_err)
        final = json.loads((root / "state.json").read_text())
        print(final["status"] + ": " + sha, flush=True)
        if final["status"] != "deployed":
            raise RuntimeError("Deployment failed; inspect its private log and state.json")
    finally:
        for lock in locks:
            lock.close()


def deploy(root, config, state, release, sha):
    old, old_tag = Path(state["release"]), state["tag"]
    stage = "preflight"
    paused = False
    before = None
    try:
        validate_candidate(rendered(release, sha), config["approved"], sha)
        if live_mounts(old, old_tag) != config["approved"]["volumes"]:
            raise RuntimeError("Live persistent mounts changed")
        before = migrations(old, old_tag)
        validate_migrations(release, before)
        needed = max(6 * 1024**3, required_backup_space(old, old_tag, config["approved"]["volumes"]))
        if shutil.disk_usage(root).free < needed:
            raise RuntimeError("Insufficient free disk space for build and data/photo backup")
        stage = "build"
        compose(release, sha, "build", "api", "web")
        if shutil.disk_usage(root).free < needed:
            raise RuntimeError("Not enough space left for a safe backup")
        stage = "backup"
        backup = Path(config["workspace"]) / "backups" / ("auto-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + sha[:12])
        state["backup"] = str(backup)
        state["in_progress"] = {"sha": sha, "before": before, "http_port": config["http_port"]}
        atomic_json(root / "state.json", state)
        env = release_env(old_tag)
        env.update({"LAVIA_BACKUP_PROJECT_DIR": str(old), "LAVIA_BACKUP_LOCK_HELD": "1", "LAVIA_BACKUP_KEEP_STOPPED": "1"})
        run(["bash", str(Path(__file__).with_name("backup.sh")), str(backup)], cwd=old, env=env)
        paused = True
        state["backup"] = str(backup)
        stage = "migrations"
        compose(release, sha, "run", "--rm", "--no-deps", "migrate")
        stage = "health"
        smoke(release, sha, config["http_port"])
        if live_mounts(release, sha) != config["approved"]["volumes"]:
            raise RuntimeError("Persistent mount validation failed after deploy")
        atomic_json(root / "state.json", {"current_sha": sha, "release": str(release), "tag": sha, "previous_sha": state["current_sha"], "previous_release": str(old), "previous_tag": old_tag, "backup": str(backup), "status": "deployed", "finished_at": int(time.time())})
    except BaseException as error:
        print("Release failed at stage " + stage + ": " + str(error), flush=True)
        status = "failed-before-update"
        if paused or "in_progress" in state:
            status = recover(state)
        state.pop("in_progress", None)
        # Never restore the database or files automatically.
        atomic_json(root / "state.json", {**state, "failed_sha": sha, "failed_stage": stage, "status": status, "finished_at": int(time.time())})


def main():
    os.umask(0o077)
    def interrupted(signum, frame):
        raise KeyboardInterrupt("Deployment interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=Path, default=Path.home() / ".local/share/lavia-deploy")
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("init"); setup.add_argument("--workspace", type=Path, required=True)
    watch = sub.add_parser("check"); watch.add_argument("--retry", action="store_true")
    sub.add_parser("status")
    args = parser.parse_args()
    if args.command == "init": init(args.state, args.workspace)
    elif args.command == "check": check(args.state, args.retry)
    else: print((args.state / "state.json").read_text())


if __name__ == "__main__":
    main()
