package jp.stepkobetsu.pastexamscanner

import org.json.JSONArray

data class School(val id: String, val name: String, val examCount: Int)

/** Only the school master is cached; registration data must always be fetched fresh. */
object SchoolCatalog {
    fun parse(raw: String): List<School> {
        val array = JSONArray(raw)
        require(array.length() > 0) { "学校一覧が空です" }
        val result = (0 until array.length()).map { i ->
            val item = array.getJSONObject(i)
            val id = item.getString("id")
            val name = item.getString("name")
            val count = item.getInt("examCount")
            require(id.isNotBlank() && !id.contains("||") && name.isNotBlank() && count in 1..20) {
                "学校一覧の形式を確認できません"
            }
            School(id, name, count)
        }
        require(result.map { it.id }.distinct().size == result.size) { "学校IDが重複しています" }
        return result
    }

    fun restore(cached: String?, bundled: String): List<School> =
        cached?.let { runCatching { parse(it) }.getOrNull() } ?: parse(bundled)
}
