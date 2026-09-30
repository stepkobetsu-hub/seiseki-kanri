package jp.stepkobetsu.pastexamscanner

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class RegistrationDataTest {
    private val key = "school-1||2024||中1||第4回||国語"

    @Test fun archivedRegistrationPreservesOtherEntriesAndFlags() {
        val item = JSONObject().put("noan", true).put("stu", true)
            .put("files", JSONArray().put(JSONObject().put("fileId", "existing")))
        val db = JSONObject().put(key, item).put("other", JSONObject().put("memo", "keep"))
        RegistrationData.merge(db, key, JSONObject().put("fileId", "scanned"))
        assertTrue(RegistrationData.contains(db, key, "scanned"))
        assertTrue(RegistrationData.contains(db, key, "existing"))
        assertTrue(db.getJSONObject(key).getBoolean("noan"))
        assertTrue(db.getJSONObject(key).getBoolean("stu"))
        assertEquals("keep", db.getJSONObject("other").getString("memo"))
    }

    @Test fun retryDoesNotDuplicateFileId() {
        val db = JSONObject()
        repeat(2) { RegistrationData.merge(db, key, JSONObject().put("fileId", "same")) }
        assertEquals(1, db.getJSONObject(key).getJSONArray("files").length())
        assertFalse(RegistrationData.contains(db, "other", "same"))
    }

    @Test(expected = org.json.JSONException::class)
    fun malformedLoadIsRejected() {
        RegistrationData.requireData(JSONObject().put("ok", true).put("data", JSONObject().put("schools", JSONArray())))
    }

    @Test(expected = IllegalStateException::class)
    fun unsuccessfulLoadIsRejected() {
        RegistrationData.requireData(JSONObject().put("ok", false).put("error", "failed"))
    }
}
