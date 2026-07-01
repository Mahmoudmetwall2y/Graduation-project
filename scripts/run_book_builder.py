"""Launcher for the AscultiCor template-based Word book generator."""

import runpy


namespace = runpy.run_path("scripts/build_graduation_book.py")
namespace["build"]()
