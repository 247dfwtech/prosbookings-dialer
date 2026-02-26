package com.prosbookings.inboundlookup

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log

class PhoneStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        if (state != TelephonyManager.EXTRA_STATE_RINGING) return

        @Suppress("DEPRECATION")
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        if (number.isNullOrBlank()) {
            Log.w(TAG, "Incoming call but no number (restricted on Android 10+ without Call Screening)")
            return
        }
        val digits = number.replace(Regex("[^0-9]"), "")
        if (digits.length < 10) return

        val baseUrl = Prefs.baseUrl
        if (baseUrl.isBlank()) {
            Log.w(TAG, "Base URL not set; open app and set your published app URL")
            return
        }

        val lookup = Intent(context, LookupService::class.java).apply {
            putExtra(LookupService.EXTRA_PHONE, digits)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(lookup)
        } else {
            context.startService(lookup)
        }
    }

    companion object {
        private const val TAG = "PhoneStateReceiver"
    }
}
