import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import hashlib
import fcntl

spec = importlib.util.spec_from_file_location("auto_deploy", Path(__file__).parents[2] / "infra/auto-deploy/deploy.py")
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.mount = self.root / "roles.sql"
        self.mount.write_text("-- initializer\n")
        self.config = {"name": "lavia", "services": {}, "volumes": {}}
        for name in deploy.INFRA:
            self.config["services"][name] = {"image": "fixed/" + name + ":1", "environment": {"EXAMPLE": "value"}, "volumes": []}
        for service, targets in deploy.PERSISTENT.items():
            for i, target in enumerate(sorted(targets)):
                key = service + str(i)
                self.config["volumes"][key] = {"name": "lavia_" + key}
                self.config["services"][service]["volumes"].append({"type": "volume", "source": key, "target": target})
        self.config["services"]["db"]["volumes"].append({"type": "bind", "source": str(self.mount), "target": "/init/roles.sql"})
        for name, image in [("api", "api"), ("migrate", "api"), ("web", "web")]:
            self.config["services"][name] = {"image": "lavia/" + image + ":sha"}
        self.config["services"]["web"]["ports"] = [{"host_ip": "127.0.0.1", "published": "8130", "target": 80}]
        self.approved = {"volumes": deploy.persistent_mounts(self.config), "infrastructure": deploy.signature(self.config), "web_ports": self.config["services"]["web"]["ports"]}

    def tearDown(self):
        self.temp.cleanup()

    def test_relocated_checkout_with_same_initializer_preserves_fingerprint(self):
        other = self.root / "release-2"; other.mkdir()
        file = other / "roles.sql"; file.write_bytes(self.mount.read_bytes())
        candidate = copy.deepcopy(self.config)
        candidate["services"]["db"]["volumes"][-1]["source"] = str(file)
        deploy.validate_candidate(candidate, self.approved, "sha")

    def test_changed_persistence_infrastructure_and_listener_are_rejected(self):
        variants = []
        c = copy.deepcopy(self.config); c["name"] = "empty-new-project"; variants.append(c)
        c = copy.deepcopy(self.config); c["volumes"]["storage0"]["name"] = "new-empty-storage"; variants.append(c)
        c = copy.deepcopy(self.config); c["services"]["db"]["image"] = "postgres:new-major"; variants.append(c)
        c = copy.deepcopy(self.config); c["services"]["auth"]["environment"]["EXAMPLE"] = "changed"; variants.append(c)
        c = copy.deepcopy(self.config); c["services"]["web"]["ports"][0]["host_ip"] = "0.0.0.0"; variants.append(c)
        for variant in variants:
            with self.assertRaises(RuntimeError):
                deploy.validate_candidate(variant, self.approved, "sha")

    def test_applied_migrations_cannot_change_disappear_or_be_reordered(self):
        folder = self.root / "database/migrations"; folder.mkdir(parents=True)
        file = folder / "001_first.sql"; file.write_text("SELECT 1;")
        applied = [{"name": file.name, "checksum": hashlib.sha256(file.read_bytes()).hexdigest()}]
        deploy.validate_migrations(self.root, applied)
        file.write_text("DROP TABLE example;")
        with self.assertRaises(RuntimeError): deploy.validate_migrations(self.root, applied)
        file.unlink()
        with self.assertRaises(RuntimeError): deploy.validate_migrations(self.root, applied)
        file.write_text("SELECT 1;")
        (folder / "000_late.sql").write_text("SELECT 2;")
        with self.assertRaises(RuntimeError): deploy.validate_migrations(self.root, applied)

    def test_changed_schema_failure_stays_in_maintenance_without_restore(self):
        state = {"release": str(self.root), "tag": "old", "in_progress": {"before": [], "http_port": 8130}}
        with patch.object(deploy, "compose") as compose, patch.object(deploy, "migrations", return_value=[{"name": "new"}]), patch.object(deploy, "smoke") as smoke:
            self.assertEqual(deploy.recover(state), "failed-maintenance-schema-changed")
            smoke.assert_not_called()
            self.assertEqual(compose.call_args.args[2], "stop")

    def test_unchanged_schema_failure_resumes_previous_images(self):
        state = {"release": str(self.root), "tag": "old", "in_progress": {"before": [], "http_port": 8130}}
        with patch.object(deploy, "compose"), patch.object(deploy, "migrations", return_value=[]), patch.object(deploy, "smoke") as smoke:
            self.assertEqual(deploy.recover(state), "failed-rolled-back")
            smoke.assert_called_once_with(self.root, "old", 8130)

    def test_failed_build_does_not_pause_writers_or_run_migrations(self):
        state = {"current_sha": "a" * 40, "release": str(self.root), "tag": "old", "status": "ready"}
        cfg = {"approved": self.approved, "workspace": str(self.root), "http_port": 8130}
        with patch.object(deploy, "rendered", return_value=self.config), patch.object(deploy, "validate_candidate"), patch.object(deploy, "live_mounts", return_value=self.approved["volumes"]), patch.object(deploy, "migrations", return_value=[]), patch.object(deploy, "validate_migrations"), patch.object(deploy, "required_backup_space", return_value=0), patch.object(deploy.shutil, "disk_usage", return_value=type("Usage", (), {"free": 20 * 1024**3})()), patch.object(deploy, "compose", side_effect=RuntimeError("build failed")) as compose, patch.object(deploy, "run") as run:
            deploy.deploy(self.root, cfg, state, self.root, "b" * 40)
            run.assert_not_called()
            compose.assert_called_once_with(self.root, "b" * 40, "build", "api", "web")
            self.assertEqual(json.loads((self.root / "state.json").read_text())["status"], "failed-before-update")

    def test_existing_deployment_lock_prevents_another_fetch_or_deploy(self):
        workspace = self.root / "workspace"; (workspace / ".local").mkdir(parents=True)
        deploy.atomic_json(self.root / "config.json", {"workspace": str(workspace)})
        with (workspace / ".local/deploy.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(deploy, "run") as run:
                deploy.check(self.root)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
