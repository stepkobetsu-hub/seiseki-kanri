package jp.stepkobetsu.pastexamscanner

import org.junit.Assert.*
import org.junit.Test

class SchoolCatalogTest {
    private val bundled = """[{"id":"s1","name":"学校","examCount":5}]"""
    @Test fun firstLaunchAndCorruptCacheUseBundledMaster() {
        for (cached in listOf(null, "broken", "[]", """[{"id":"s1","name":"学校","examCount":0}]""")) {
            assertEquals(SchoolCatalog.parse(bundled), SchoolCatalog.restore(cached, bundled))
        }
    }
    @Test fun savedRevisionTakesPrecedence() {
        val revised = """[{"id":"s8","name":"追加学校","examCount":4}]"""
        assertEquals(listOf(School("s8", "追加学校", 4)), SchoolCatalog.restore(revised, bundled))
    }
    @Test fun duplicateIdsAreRejected() {
        val repeated = """[{"id":"s1","name":"学校","examCount":5},{"id":"s1","name":"別学校","examCount":5}]"""
        assertTrue(runCatching { SchoolCatalog.parse(repeated) }.isFailure)
    }
}
