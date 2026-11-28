package com.habitline.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.habitline.nativework.NativeIntents
import com.habitline.nativework.NativeWork
import com.habitline.nativework.persistNative

class ToggleCompletionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val mark = NativeIntents.readWidgetMark(intent.data) ?: return
        if (mark.widget !in HabitWidgetProvider.ids(context)) return
        val uri = requireNotNull(intent.data)
        persistNative { NativeWork.action(context, uri) }
    }

    companion object { const val ACTION = "com.habitline.widget.SET_COMPLETED" }
}
