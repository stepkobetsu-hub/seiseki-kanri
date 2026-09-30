package jp.stepkobetsu.pastexamscanner

import org.json.JSONArray
import org.json.JSONObject

internal object RegistrationData {
    fun requireData(response: JSONObject): JSONObject {
        check(response.optBoolean("ok")) { response.optString("error", "DB読み込み失敗") }
        val data = response.getJSONObject("data")
        // A malformed load must never become an empty saveFull payload.
        data.getJSONArray("schools")
        data.getJSONObject("db")
        return data
    }

    fun contains(db: JSONObject, key: String, fileId: String): Boolean {
        val files = db.optJSONObject(key)?.optJSONArray("files") ?: return false
        return (0 until files.length()).any { files.optJSONObject(it)?.optString("fileId") == fileId }
    }

    fun merge(db: JSONObject, key: String, file: JSONObject) {
        require(file.getString("fileId").isNotBlank())
        if (contains(db, key, file.getString("fileId"))) return
        val item = db.optJSONObject(key) ?: JSONObject().put("noan", false).put("stu", false)
        val files = if (item.has("files")) item.getJSONArray("files") else JSONArray()
        files.put(file)
        item.put("files", files).put("hasNew", true)
        db.put(key, item)
    }
}
