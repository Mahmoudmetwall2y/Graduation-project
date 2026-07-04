#!/usr/bin/env python3
"""Load the production ECG artifact and execute its deployed tensor contract."""

from __future__ import annotations

import os
import pickle
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
from tensorflow import keras


MODEL_PATH = Path(os.getenv(
    "MODEL_2_PATH",
    "new-models/ecg_mitbih_single_lead/single_lead_updated.keras",
))
META_PATH = Path(os.getenv(
    "MODEL_2_META_PATH",
    "new-models/ecg_mitbih_single_lead/label_encoder_SL.pkl",
))


def tensor_contract(model: keras.Model) -> dict[str, tuple[int, ...]]:
    return {
        tensor.name.split(":", 1)[0]: tuple(int(dim) for dim in tensor.shape[1:])
        for tensor in model.inputs
    }


def main() -> None:
    expected_inputs = {
        "ecg_input": (500, 1),
        "rr_input": (9,),
        "fc_input": (500, 1),
    }
    expected_outputs = {"class_head", "risk_head", "fc_out"}

    model = keras.models.load_model(MODEL_PATH, compile=False)
    assert tensor_contract(model) == expected_inputs, tensor_contract(model)
    assert set(model.output_names) == expected_outputs, model.output_names

    with META_PATH.open("rb") as handle:
        metadata = pickle.load(handle)
    assert metadata["fs"] == 125
    assert metadata["input_size"] == 500
    assert metadata["n_leads"] == 1
    assert metadata["n_rr"] == 9
    assert list(metadata["mit_classes"].values()) == [
        "Normal", "SVEB", "VEB", "Fusion", "Unknown"
    ]

    inputs = {
        "ecg_input": np.zeros((1, 500, 1), dtype=np.float32),
        "rr_input": np.zeros((1, 9), dtype=np.float32),
        "fc_input": np.zeros((1, 500, 1), dtype=np.float32),
    }
    outputs = model(inputs, training=False)
    if not isinstance(outputs, dict):
        assert len(outputs) == len(model.output_names), (
            len(outputs), model.output_names
        )
        outputs = dict(zip(model.output_names, outputs))

    class_head = np.asarray(outputs["class_head"])
    risk_head = np.asarray(outputs["risk_head"])
    forecast = np.asarray(outputs["fc_out"])
    assert class_head.shape == (1, 5)
    assert risk_head.shape == (1, 1)
    assert forecast.shape == (1, 500, 1)
    assert np.isfinite(class_head).all()
    assert np.isfinite(risk_head).all()
    assert np.isfinite(forecast).all()
    assert np.allclose(class_head.sum(axis=1), 1.0, atol=1e-3)
    assert ((risk_head >= 0.0) & (risk_head <= 1.0)).all()

    print("ECG model validation passed")
    print(f"inputs={tensor_contract(model)}")
    print(f"outputs={model.output_names}")


if __name__ == "__main__":
    main()
