package com.example.sonocardia

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private val CHANNEL = "sonocardia/intent"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "getIntentFile") {
                    val path = handleIntent(intent)
                    result.success(path)
                } else {
                    result.notImplemented()
                }
            }
    }

    private fun handleIntent(intent: Intent?): String? {
        if (intent == null) return null
        val action = intent.action
        val uri: Uri? = intent.data

        if (action == Intent.ACTION_VIEW && uri != null) {
            // Copy content:// URI to a temp file so Flutter can read it
            return try {
                val inputStream = contentResolver.openInputStream(uri) ?: return null
                val tempFile = File(cacheDir, "import_${System.currentTimeMillis()}.sono")
                FileOutputStream(tempFile).use { out ->
                    inputStream.copyTo(out)
                }
                inputStream.close()
                tempFile.absolutePath
            } catch (e: Exception) {
                null
            }
        }
        return null
    }
}
