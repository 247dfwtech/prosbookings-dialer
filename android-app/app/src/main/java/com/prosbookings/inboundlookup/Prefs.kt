package com.prosbookings.inboundlookup

import android.content.Context
import android.content.SharedPreferences

object Prefs {
    private lateinit var prefs: SharedPreferences

    const val KEY_BASE_URL = "base_url"
    const val KEY_API_KEY = "api_key"
    const val DEFAULT_BASE_URL = ""

    fun init(context: Context) {
        prefs = context.getSharedPreferences("inbound_lookup", Context.MODE_PRIVATE)
    }

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = prefs.edit().putString(KEY_BASE_URL, value.trim().removeSuffix("/")).apply()

    var apiKey: String
        get() = prefs.getString(KEY_API_KEY, "") ?: ""
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()
}
