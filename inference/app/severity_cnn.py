"""PyTorch architecture for the delivered multi-head murmur CNN checkpoint."""

from typing import Dict

import torch
from torch import nn


class ConvBlock(nn.Module):
    """Convolution, batch normalization, and ReLU activation."""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.net(inputs)


class ResidualBlock(nn.Module):
    """Two same-width convolution blocks with an identity skip."""

    def __init__(self, channels: int):
        super().__init__()
        self.c1 = ConvBlock(channels, channels)
        self.c2 = ConvBlock(channels, channels)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return torch.relu(self.c2(self.c1(inputs)) + inputs)


class MurmurSeverityCNN(nn.Module):
    """Five-stage CNN reconstructed from the delivered checkpoint contract."""

    def __init__(self, n_classes: Dict[str, int], input_channels: int = 4):
        super().__init__()
        widths = (32, 64, 128, 256, 256)
        layers = []
        in_channels = input_channels
        for width in widths:
            layers.extend([
                ConvBlock(in_channels, width),
                ResidualBlock(width),
                nn.MaxPool2d(kernel_size=2),
                nn.Dropout2d(0.15),
            ])
            in_channels = width

        # Replacing the last pool/dropout with adaptive pooling keeps the state
        # dict indices intact while accepting variable-length spectrograms.
        layers[-2] = nn.AdaptiveAvgPool2d((1, 1))
        layers[-1] = nn.Flatten()
        self.backbone = nn.Sequential(*layers)

        self.shared = nn.Sequential(
            nn.Dropout(0.25),
            nn.Linear(widths[-1], 256),
            nn.BatchNorm1d(256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.25),
        )
        self.heads = nn.ModuleDict({
            key: nn.Sequential(
                nn.Linear(256, 64),
                nn.ReLU(inplace=True),
                nn.Dropout(0.20),
                nn.Linear(64, count),
            )
            for key, count in n_classes.items()
        })

    def forward(self, inputs: torch.Tensor) -> Dict[str, torch.Tensor]:
        shared = self.shared(self.backbone(inputs))
        return {key: head(shared) for key, head in self.heads.items()}
