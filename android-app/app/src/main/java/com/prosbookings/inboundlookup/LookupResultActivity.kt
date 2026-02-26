package com.prosbookings.inboundlookup

import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class LookupResultActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_lookup_result)
        val phone = intent.getStringExtra(EXTRA_PHONE) ?: ""
        val found = intent.getBooleanExtra(EXTRA_FOUND, false)
        val error = intent.getStringExtra(EXTRA_ERROR)
        val nameTv = findViewById<TextView>(R.id.result_name)
        val addressTv = findViewById<TextView>(R.id.result_address)
        val phoneTv = findViewById<TextView>(R.id.result_phone)
        val subtitleTv = findViewById<TextView>(R.id.result_subtitle)
        phoneTv.text = formatPhone(phone)
        if (error != null) {
            subtitleTv.text = "Lookup failed: $error"
            nameTv.text = "—"
            addressTv.text = "—"
        } else if (found) {
            val first = intent.getStringExtra(EXTRA_FIRST_NAME) ?: ""
            val last = intent.getStringExtra(EXTRA_LAST_NAME) ?: ""
            val address = intent.getStringExtra(EXTRA_ADDRESS) ?: ""
            val city = intent.getStringExtra(EXTRA_CITY) ?: ""
            val zip = intent.getStringExtra(EXTRA_ZIP) ?: ""
            nameTv.text = listOf(first, last).filter { it.isNotBlank() }.joinToString(" ") .ifBlank { "—" }
            addressTv.text = listOf(address, city, zip).filter { it.isNotBlank() }.joinToString(", ").ifBlank { "—" }
            subtitleTv.text = "Found in your contact list"
        } else {
            nameTv.text = "—"
            addressTv.text = "—"
            subtitleTv.text = "Not in any uploaded spreadsheet"
        }
        findViewById<TextView>(R.id.result_dismiss).setOnClickListener { finish() }
    }

    private fun formatPhone(p: String): String {
        val d = p.replace(Regex("[^0-9]"), "")
        return when {
            d.length >= 10 -> "(${d.takeLast(10).take(3)}) ${d.takeLast(7).take(3)}-${d.takeLast(4)}"
            else -> p
        }
    }

    companion object {
        const val EXTRA_PHONE = "phone"
        const val EXTRA_FOUND = "found"
        const val EXTRA_FIRST_NAME = "firstName"
        const val EXTRA_LAST_NAME = "lastName"
        const val EXTRA_ADDRESS = "address"
        const val EXTRA_CITY = "city"
        const val EXTRA_ZIP = "zip"
        const val EXTRA_ERROR = "error"
    }
}
