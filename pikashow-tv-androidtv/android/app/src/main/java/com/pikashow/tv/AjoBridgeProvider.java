package com.pikashow.tv;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

/**
 * Serves the app's Continue Watching feed to the Home launcher (com.gathin.tvhome reads
 * content://com.ajo.androidtv/continue, one "json" column). The WebView writes the JSON through the
 * AjoLink bridge on every progress save; this just hands it out. Read-only, no PII beyond titles.
 */
public class AjoBridgeProvider extends ContentProvider {

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String json = "{\"items\":[]}";
        try {
            if (getContext() != null && uri != null && "continue".equals(uri.getLastPathSegment())) {
                String stored = getContext().getSharedPreferences("ajo_bridge", 0)
                        .getString("continue_json", null);
                if (stored != null && !stored.isEmpty()) json = stored;
            }
        } catch (Throwable ignored) { }
        MatrixCursor cursor = new MatrixCursor(new String[]{"json"});
        cursor.addRow(new Object[]{json});
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "text/plain";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
