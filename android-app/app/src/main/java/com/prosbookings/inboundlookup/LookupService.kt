package com.prosbookings.inboundlookup

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LookupService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val phone = intent?.getStringExtra(EXTRA_PHONE) ?: run {
            stopSelf(startId)
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, createNotification())
        val baseUrl = Prefs.baseUrl
        if (baseUrl.isBlank()) {
            showResult(phone, null)
            stopSelf(startId)
            return START_NOT_STICKY
        }
        executor.execute {
            try {
                val url = URL("$baseUrl/api/webhook/inbound-lookup")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 10_000
                conn.readTimeout = 10_000
                Prefs.apiKey.takeIf { it.isNotBlank() }?.let { key ->
                    conn.setRequestProperty("X-API-Key", key)
                }
                conn.outputStream.use { os ->
                    val body = JSONObject().apply {
                        put("phone", phone)
                        if (Prefs.apiKey.isNotBlank()) put("apiKey", Prefs.apiKey)
                    }
                    os.write(body.toString().toByteArray(Charsets.UTF_8))
                }
                val code = conn.responseCode
                val response = if (code in 200..299) {
                    conn.inputStream.bufferedReader(Charsets.UTF_8).readText()
                } else {
                    conn.errorStream?.bufferedReader(Charsets.UTF_8)?.readText() ?: "Error $code"
                }
                conn.disconnect()
                val json = JSONObject(response)
                val found = json.optBoolean("found", false)
                val contact = if (found) LookupContact(
                    firstName = json.optString("firstName", ""),
                    lastName = json.optString("lastName", ""),
                    address = json.optString("address", ""),
                    city = json.optString("city", ""),
                    zip = json.optString("zip", ""),
                    phone = json.optString("phone", phone)
                ) else null
                runOnMain { showResult(phone, contact) }
            } catch (e: Exception) {
                Log.e(TAG, "Lookup failed", e)
                runOnMain { showResult(phone, null, error = e.message) }
            } finally {
                runOnMain { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(startId) }
            }
        }
        return START_NOT_STICKY
    }

    private fun runOnMain(block: () -> Unit) {
        android.os.Handler(android.os.Looper.getMainLooper()).post(block)
    }

    private fun showResult(phone: String, contact: LookupContact?, error: String? = null) {
        startActivity(Intent(this, LookupResultActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            putExtra(LookupResultActivity.EXTRA_PHONE, phone)
            putExtra(LookupResultActivity.EXTRA_FOUND, contact != null)
            contact?.let {
                putExtra(LookupResultActivity.EXTRA_FIRST_NAME, it.firstName)
                putExtra(LookupResultActivity.EXTRA_LAST_NAME, it.lastName)
                putExtra(LookupResultActivity.EXTRA_ADDRESS, it.address)
                putExtra(LookupResultActivity.EXTRA_CITY, it.city)
                putExtra(LookupResultActivity.EXTRA_ZIP, it.zip)
            }
            error?.let { putExtra(LookupResultActivity.EXTRA_ERROR, it) }
        })
    }

    private fun createNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Lookup", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Looking up caller…")
            .setSmallIcon(android.R.drawable.ic_menu_search)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private val executor = Executors.newSingleThreadExecutor()

    companion object {
        const val EXTRA_PHONE = "phone"
        private const val TAG = "LookupService"
        private const val CHANNEL_ID = "lookup"
        private const val NOTIFICATION_ID = 1
    }
}

data class LookupContact(
    val firstName: String,
    val lastName: String,
    val address: String,
    val city: String,
    val zip: String,
    val phone: String
)
