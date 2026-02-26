package com.prosbookings.inboundlookup

import android.app.Application

class InboundLookupApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
    }
}
