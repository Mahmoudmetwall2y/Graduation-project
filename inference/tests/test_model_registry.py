"""
Smoke tests for the model registry and inference engine.

These tests verify the integration without requiring real model files
by patching the filesystem and ML library calls. They confirm:

  1. Registry loads all three slot definitions and the Model 3 contract.
  2. Model 3 can still be disabled without crashing the system.
  3. Missing artifact on an ENABLED model raises a clear, logged error.
  4. Inference response handles 2 active models correctly.
  5. Enabling a missing model produces a clear error (not a crash).

Run with:
    cd inference
    pip install pytest
    pytest tests/test_model_registry.py -v
"""

import os
import sys
import types
import pytest
import numpy as np
from pathlib import Path
from unittest.mock import MagicMock, patch


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_fake_xgboost():
    """Create a minimal XGBoost mock that satisfies predict_proba."""
    model = MagicMock()
    model.predict_proba.return_value = np.array([[0.70, 0.20, 0.10]])
    return model


def _make_fake_keras_ecg():
    """Create a Keras model mock that returns the multi-head output dict."""
    class FakeTensor:
        def __init__(self, name, shape):
            self.name = name
            self.shape = shape

    model = MagicMock()
    model.inputs = [
        FakeTensor("ecg_input", (None, 500, 1)),
        FakeTensor("rr_input", (None, 9)),
        FakeTensor("fc_input", (None, 500, 1)),
    ]
    model.output_names = ["class_head", "risk_head", "fc_out"]
    model.predict.return_value = {
        "class_head": np.array([[0.80, 0.10, 0.05, 0.03, 0.02]]),
        "risk_head": np.array([[0.15]]),
        "fc_out": np.zeros((1, 500)),
    }
    return model


def _env_with_demo(demo: bool = True, **extra):
    """Build an env dict for patching os.environ."""
    env = {
        "ENABLE_DEMO_MODE": "true" if demo else "false",
        "MODEL_1_ENABLED": "true",
        "MODEL_2_ENABLED": "true",
        "MODEL_3_ENABLED": "false",
        "MODEL_1_VERSION": "v2.0.0",
        "MODEL_2_VERSION": "v2.0.0",
        "MODEL_3_VERSION": "pending",
        # Unit tests must never deserialize repository artifacts implicitly.
        "MODEL_1_PATH": "/nonexistent/test/model1.pkl",
        "MODEL_1_SCALER_PATH": "/nonexistent/test/scaler.pkl",
        "MODEL_2_PATH": "/nonexistent/test/model2.keras",
        "MODEL_2_META_PATH": "/nonexistent/test/model2-meta.pkl",
        "MODEL_3_PATH": "/nonexistent/test/model3.pkl",
        "PCG_SAMPLE_RATE": "22050",
        "PCG_TARGET_DURATION": "10",
        "ECG_SAMPLE_RATE": "125",
        "ECG_WINDOW_SIZE": "500",
        "ECG_MAX_WINDOWS": "4",
    }
    env.update(extra)
    return env


# ─── Registry Tests ───────────────────────────────────────────────────────────

class TestModelRegistry:
    """Tests for model_registry.py — slot definitions and env resolution."""

    def test_registry_has_three_slots(self):
        """Registry must always define exactly 3 model slots."""
        with patch.dict(os.environ, _env_with_demo()):
            # Force re-import to pick up fresh env
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            assert len(reg.MODEL_REGISTRY) == 3, (
                f"Expected 3 slots, got {len(reg.MODEL_REGISTRY)}: "
                f"{list(reg.MODEL_REGISTRY.keys())}"
            )

    def test_model3_can_be_disabled(self):
        """The test environment can explicitly leave only Models 1 and 2 active."""
        with patch.dict(os.environ, _env_with_demo()):
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            enabled = reg.list_active_models()
            assert len(enabled) == 2, f"Expected 2 active, got {[m.key for m in enabled]}"

    def test_disabled_model3_is_reported_pending(self):
        """A disabled Model 3 is represented as unavailable in the registry."""
        with patch.dict(os.environ, _env_with_demo()):
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            cfg = reg.get_model_config("severity_cnn")
            assert not cfg.enabled, "severity_cnn should be disabled by default"
            pending = reg.list_pending_models()
            assert any(m.key == "severity_cnn" for m in pending)

    def test_pcg_default_classes_are_three(self):
        """XGBoost default class list must be the confirmed 3 classes."""
        with patch.dict(os.environ, _env_with_demo()):
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            cfg = reg.get_model_config("pcg_xgboost")
            classes = cfg.label_mapping.get("default_classes", [])
            assert set(classes) == {"normal", "murmur", "artifact"}, (
                f"Expected 3-class set, got {classes}"
            )

    def test_model3_enabled_via_env(self):
        """When MODEL_3_ENABLED=true is set, severity_cnn becomes enabled."""
        env = _env_with_demo()
        env["MODEL_3_ENABLED"] = "true"
        with patch.dict(os.environ, env):
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            cfg = reg.get_model_config("severity_cnn")
            assert cfg.enabled, "severity_cnn should be enabled when MODEL_3_ENABLED=true"


# ─── Inference Engine Tests ───────────────────────────────────────────────────

class TestInferenceEngineDemo:
    """Test the inference engine in demo mode (no real model files needed)."""

    @pytest.fixture
    def engine(self):
        """Create an InferenceEngine in demo mode."""
        with patch.dict(os.environ, _env_with_demo(demo=True)):
            import importlib
            import inference.app.model_registry as reg
            import inference.app.inference as inf_mod
            importlib.reload(reg)
            importlib.reload(inf_mod)
            engine = inf_mod.InferenceEngine(enable_demo_mode=True)
            engine.pcg_preprocessor.process = MagicMock(
                return_value=np.zeros(1224, dtype=np.float32)
            )
            yield engine

    def test_engine_starts_in_demo_mode(self, engine):
        """Engine must start without errors in demo mode."""
        assert engine.demo_mode_active is True

    def test_model3_disabled_does_not_crash(self, engine):
        """A deliberately disabled severity model returns a clear response."""
        dummy_audio = np.zeros(22050, dtype=np.float32)
        result = engine.predict_murmur_severity(dummy_audio, 22050)
        assert result is not None, "Should return a response, not None"
        assert result.get("status") == "disabled", (
            f"Expected status='disabled', got: {result}"
        )

    def test_pcg_demo_prediction_returns_3_classes(self, engine):
        """Demo PCG prediction must return 3 classes (normal, murmur, artifact)."""
        dummy_audio = np.random.randn(22050).astype(np.float32)
        result = engine.predict_pcg(dummy_audio, 22050)
        assert "probabilities" in result
        probs = result["probabilities"]
        class_names = {k.lower() for k in probs.keys()}
        assert class_names == {"normal", "murmur", "artifact"}, (
            f"Unexpected classes: {class_names}"
        )

    def test_ecg_demo_prediction_structure(self, engine):
        """Demo ECG prediction must include prediction, risk_score, probabilities."""
        dummy_ecg = np.random.randn(1000).astype(np.float32)
        result = engine.predict_ecg(dummy_ecg, 500)
        for key in ("prediction", "confidence", "risk_score", "risk_label", "probabilities"):
            assert key in result, f"Missing key '{key}' in ECG result: {result.keys()}"

    def test_model_status_shows_pending_model3(self, engine):
        """get_model_status must report severity_cnn as pending."""
        status = engine.get_model_status()
        severity_detail = status["details"].get("severity_cnn", {})
        assert severity_detail.get("pending") is True, (
            f"Expected severity_cnn pending=True, got: {severity_detail}"
        )


class TestInferenceEngineMocked:
    """Test the inference engine with mocked model objects (no TF/sklearn needed)."""

    @pytest.fixture
    def engine_with_mocks(self, tmp_path):
        """
        Create model file stubs and inject mocked ML objects into the engine.
        This simulates a real startup without requiring actual model frameworks.
        """
        # Create dummy model files so path-exists checks pass
        xgb_path = tmp_path / "Xgboost" / "heart_sound_xgboost_model.pkl"
        scaler_path = tmp_path / "Xgboost" / "final_scaler.pkl"
        ecg_path = tmp_path / "ecg_mitbih_single_lead" / "single_lead_updated.keras"
        meta_path = tmp_path / "ecg_mitbih_single_lead" / "label_encoder_SL.pkl"
        xgb_path.parent.mkdir(parents=True)
        ecg_path.parent.mkdir(parents=True)

        import pickle
        for p in [xgb_path, scaler_path]:
            p.write_bytes(b"")
        ecg_path.write_bytes(b"")
        meta_path.write_bytes(pickle.dumps({
            # v26 SL metadata format (matches label_encoder_SL.pkl)
            "mit_classes": {0: "Normal", 1: "SVEB", 2: "VEB", 3: "Fusion", 4: "Unknown"},
            "fs": 125,
            "input_size": 500,
            "n_leads": 1,
            "n_rr": 9,
        }))

        env = _env_with_demo(
            demo=False,
            MODEL_1_PATH=str(xgb_path),
            MODEL_1_SCALER_PATH=str(scaler_path),
            MODEL_2_PATH=str(ecg_path),
            MODEL_2_META_PATH=str(meta_path),
            NEW_MODELS_DIR=str(tmp_path),
        )

        fake_xgb = _make_fake_xgboost()
        fake_keras = _make_fake_keras_ecg()
        fake_scaler = MagicMock()
        fake_scaler.transform.side_effect = lambda x: x

        with patch.dict(os.environ, env):
            import importlib
            import inference.app.model_registry as reg
            import inference.app.inference as inf_mod
            importlib.reload(reg)
            importlib.reload(inf_mod)

            with (
                patch("joblib.load", side_effect=[fake_xgb, fake_scaler]),
                patch(
                    "tensorflow.keras.models.load_model", return_value=fake_keras
                ) as load_model_mock,
            ):
                engine = inf_mod.InferenceEngine(enable_demo_mode=False)
                engine.pcg_preprocessor.process = MagicMock(
                    return_value=np.zeros(1224, dtype=np.float32)
                )

                load_model_mock.assert_called_once_with(
                    str(ecg_path), compile=False
                )

        yield engine, fake_xgb, fake_keras

    def test_two_models_loaded(self, engine_with_mocks):
        """With mocked files, engine must report 2 models loaded."""
        engine, _, _ = engine_with_mocks
        status = engine.get_model_status()
        assert status["models_loaded"] == 2, (
            f"Expected 2 loaded, got {status['models_loaded']}: {status['details']}"
        )

    def test_model3_disabled_no_crash(self, engine_with_mocks):
        """Model 3 can be disabled without affecting the other models."""
        engine, _, _ = engine_with_mocks
        audio = np.zeros(22050, dtype=np.float32)
        result = engine.predict_murmur_severity(audio, 22050)
        assert result.get("status") == "disabled"

    def test_pcg_prediction_uses_new_model(self, engine_with_mocks):
        """PCG prediction must call the mocked XGBoost model."""
        engine, fake_xgb, _ = engine_with_mocks
        audio = np.random.randn(22050).astype(np.float32)
        result = engine.predict_pcg(audio, 22050)
        fake_xgb.predict_proba.assert_called_once()
        assert result.get("label") in ("Normal", "Murmur", "Artifact")

    def test_ecg_prediction_uses_new_model(self, engine_with_mocks):
        """ECG prediction must call the mocked Keras model."""
        engine, _, fake_keras = engine_with_mocks
        ecg = np.random.randn(1000).astype(np.float32)
        result = engine.predict_ecg(ecg, 500)
        fake_keras.predict.assert_called()
        assert "risk_score" in result
        assert "prediction" in result


class TestMissingEnabledModel:
    """Enabling a model with a missing artifact must produce a clear error."""

    def test_enabled_model_with_missing_file_logs_error(self, caplog):
        """
        When MODEL_1_ENABLED=true but the file doesn't exist,
        the engine must start (in demo mode) and log a clear error message.
        """
        env = _env_with_demo(
            demo=True,
            MODEL_1_PATH="/nonexistent/path/model.pkl",
            MODEL_2_ENABLED="false",
        )
        with patch.dict(os.environ, env):
            import importlib
            import inference.app.model_registry as reg
            import inference.app.inference as inf_mod
            importlib.reload(reg)
            importlib.reload(inf_mod)

            import logging
            with caplog.at_level(logging.ERROR, logger="inference.app.inference"):
                engine = inf_mod.InferenceEngine(enable_demo_mode=True)

        # System must not crash
        assert engine is not None
        # Error must be logged
        error_logs = [r for r in caplog.records if r.levelname == "ERROR"]
        assert any("pcg_xgboost" in r.message or "Model 1" in r.message for r in error_logs), (
            f"Expected an error log about pcg_xgboost/Model 1. Got: {[r.message for r in error_logs]}"
        )
        # Must report model as not loaded
        status = engine.get_model_status()
        assert not status["details"]["pcg_xgboost"]["loaded"]


class TestDeliveredSeverityCNN:
    """Validate the architecture and labels against the delivered checkpoint."""

    def test_registry_has_six_confirmed_heads(self):
        env = _env_with_demo(MODEL_3_ENABLED="true")
        with patch.dict(os.environ, env):
            import importlib
            import inference.app.model_registry as reg
            importlib.reload(reg)
            mapping = reg.get_model_config("severity_cnn").label_mapping

        assert set(mapping["classes"]) == {
            "timing", "shape", "grading", "pitch", "quality", "location"
        }
        assert {key: len(value) for key, value in mapping["classes"].items()} == {
            "timing": 5, "shape": 5, "grading": 4,
            "pitch": 4, "quality": 4, "location": 8,
        }

    def test_delivered_checkpoint_matches_runtime_architecture(self):
        torch = pytest.importorskip("torch")
        artifact = Path(__file__).parents[2] / "new-models" / "CNN" / "best_model.pkl"
        if not artifact.exists():
            pytest.skip("Delivered CNN artifact is not present in this checkout")

        from inference.app.severity_cnn import MurmurSeverityCNN

        head_sizes = {
            "timing": 5, "shape": 5, "grading": 4,
            "pitch": 4, "quality": 4, "location": 8,
        }
        model = MurmurSeverityCNN(head_sizes, input_channels=4)
        state_dict = torch.load(str(artifact), map_location="cpu", weights_only=True)
        model.load_state_dict(state_dict, strict=True)
        model.eval()

        with torch.inference_mode():
            outputs = model(torch.zeros(1, 4, 128, 216))
        assert {key: tuple(value.shape) for key, value in outputs.items()} == {
            key: (1, size) for key, size in head_sizes.items()
        }
