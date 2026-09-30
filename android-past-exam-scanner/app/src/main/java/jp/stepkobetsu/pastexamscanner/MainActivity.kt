package jp.stepkobetsu.pastexamscanner

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.widget.ArrayAdapter
import android.widget.AdapterView
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import jp.stepkobetsu.pastexamscanner.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.FormBody
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val client = OkHttpClient()
    private val gasUrl = "https://script.google.com/macros/s/AKfycbxqxQOmtwe9lfB0Pt7dKzY3mC2sSRRVG9haDTMvOvrzyQNxhOYQLMTbnxAm9Im3LlXj/exec"
    private val pass = "step123"

    private data class School(val id: String, val name: String, val examCount: Int)

    private var schools: List<School> = emptyList()
    private var db = JSONObject()
    private var scannedPdfUri: Uri? = null

    private val scannerOptions by lazy {
        GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(30)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
    }

    private val scanner by lazy { GmsDocumentScanning.getClient(scannerOptions) }

    private val scannerLauncher = registerForActivityResult(StartIntentSenderForResult()) { activityResult ->
        if (activityResult.resultCode != Activity.RESULT_OK) return@registerForActivityResult
        val result = GmsDocumentScanningResult.fromActivityResultIntent(activityResult.data)
        val pdf = result?.pdf
        if (pdf == null) {
            showMessage("PDFを作成できませんでした。")
            return@registerForActivityResult
        }
        scannedPdfUri = pdf.uri
        binding.scanStatus.text = "✓ スキャン完了：${pdf.pageCount}ページ"
        binding.scanStatus.setTextColor(0xFF047857.toInt())
        binding.uploadButton.isEnabled = true
        updateFileNamePreview()
        showMessage("紙の切り抜き・補正を確認してPDFを作成しました。")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupStaticSpinners()
        setupListeners()
        loadSchools()
    }

    private fun setupStaticSpinners() {
        setSpinner(binding.grade, listOf("中1", "中2", "中3"))
        setSpinner(binding.subject, listOf("英語", "数学", "国語", "理科", "社会"))

        val current = currentNendo()
        setSpinner(binding.year, listOf(current.toString(), (current - 1).toString(), (current - 2).toString()))

        setSpinner(
            binding.kind,
            listOf("テストのみ", "テスト＆先生解答", "テスト＆生徒解答", "先生解答のみ", "生徒解答のみ")
        )
    }

    private fun setupListeners() {
        val updateListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                if (parent === binding.school) updateExamSpinner()
                updateFileNamePreview()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }

        listOf(binding.school, binding.grade, binding.subject, binding.year, binding.exam, binding.kind)
            .forEach { it.onItemSelectedListener = updateListener }

        binding.teacher.setOnFocusChangeListener { _, _ -> updateFileNamePreview() }

        binding.scanButton.setOnClickListener {
            if (!validateMetadata()) return@setOnClickListener
            binding.progress.visibility = View.VISIBLE
            showMessage("文書スキャナーを起動しています…")
            scanner.getStartScanIntent(this)
                .addOnSuccessListener { sender ->
                    binding.progress.visibility = View.GONE
                    scannerLauncher.launch(IntentSenderRequest.Builder(sender).build())
                }
                .addOnFailureListener { e ->
                    binding.progress.visibility = View.GONE
                    showMessage("文書スキャナーを起動できませんでした：${e.message ?: "不明なエラー"}")
                }
        }

        binding.uploadButton.setOnClickListener {
            if (!validateMetadata()) return@setOnClickListener
            val uri = scannedPdfUri
            if (uri == null) {
                showMessage("先に文書をスキャンしてください。")
                return@setOnClickListener
            }
            uploadAndRegister(uri)
        }
    }

    private fun loadSchools() {
        lifecycleScope.launch {
            setBusy(true, "学校一覧を読み込んでいます…")
            try {
                val payload = withContext(Dispatchers.IO) { gasGet("load") }
                if (!payload.optBoolean("ok")) error(payload.optString("error", "学校一覧を読み込めませんでした"))
                val data = payload.optJSONObject("data") ?: JSONObject()
                val schoolArray = data.optJSONArray("schools") ?: JSONArray()
                val loaded = mutableListOf<School>()
                for (i in 0 until schoolArray.length()) {
                    val s = schoolArray.getJSONObject(i)
                    loaded += School(
                        s.optString("id"),
                        s.optString("name"),
                        s.optInt("examCount", 5)
                    )
                }
                schools = loaded
                db = data.optJSONObject("db") ?: JSONObject()
                setSpinner(binding.school, schools.map { "${it.name}（年${it.examCount}回）" })
                updateExamSpinner()
                setBusy(false, "学校一覧を読み込みました。")
            } catch (e: Exception) {
                setBusy(false, "学校一覧の読み込みに失敗しました：${e.message}")
            }
        }
    }

    private fun updateExamSpinner() {
        val school = selectedSchool() ?: return
        setSpinner(binding.exam, (1..school.examCount).map { "第${it}回" })
        updateFileNamePreview()
    }

    private fun uploadAndRegister(uri: Uri) {
        lifecycleScope.launch {
            binding.uploadButton.isEnabled = false
            setBusy(true, "PDFをアップロードしています…")
            try {
                val context = captureContext()
                val fileName = buildFileName(context)
                val upload = withContext(Dispatchers.IO) { uploadPdf(uri, fileName) }
                if (!upload.optBoolean("ok")) error(upload.optString("error", "PDF保存に失敗しました"))

                val fileId = upload.optString("fileId")
                val url = upload.optString("url")
                if (fileId.isBlank()) error("保存したファイルIDを取得できませんでした")

                setBusy(true, "過去問DBへ登録しています…")
                withContext(Dispatchers.IO) {
                    mergeIntoLatestDb(context, fileName, fileId, url)
                }

                setBusy(true, "DBへの反映を確認しています…")
                val verified = withContext(Dispatchers.IO) { verifyRegistration(context, fileId) }
                if (!verified) error("PDFは保存されましたが、DBへの反映を確認できませんでした")

                setBusy(false, "✓ 過去問DBへの登録を確認しました。\n$fileName")
                scannedPdfUri = null
                binding.scanStatus.text = "まだスキャンしていません"
                binding.scanStatus.setTextColor(0xFF475569.toInt())
                binding.uploadButton.isEnabled = false
            } catch (e: Exception) {
                setBusy(false, "登録できませんでした：${e.message}")
                binding.uploadButton.isEnabled = scannedPdfUri != null
            }
        }
    }

    private data class ExamContext(
        val school: School,
        val year: String,
        val grade: String,
        val subject: String,
        val exam: String,
        val kind: String,
        val teacher: String
    )

    private fun captureContext(): ExamContext = ExamContext(
        school = selectedSchool() ?: error("学校を選択してください"),
        year = binding.year.selectedItem.toString(),
        grade = binding.grade.selectedItem.toString(),
        subject = binding.subject.selectedItem.toString(),
        exam = binding.exam.selectedItem.toString(),
        kind = binding.kind.selectedItem.toString(),
        teacher = binding.teacher.text.toString().trim()
    )

    private fun selectedSchool(): School? {
        val p = binding.school.selectedItemPosition
        return if (p in schools.indices) schools[p] else null
    }

    private fun validateMetadata(): Boolean {
        if (binding.teacher.text.toString().trim().isBlank()) {
            showMessage("担当者を入力してください。")
            binding.teacher.requestFocus()
            return false
        }
        if (selectedSchool() == null) {
            showMessage("学校を選択してください。")
            return false
        }
        return true
    }

    private fun buildFileName(c: ExamContext): String {
        fun clean(s: String) = s.replace(Regex("[\\\\/:*?\"<>|]"), "").replace(Regex("\\s+"), "")
        return listOf(
            clean(c.teacher),
            clean(c.school.name),
            clean(c.grade),
            clean(c.subject),
            clean(c.year),
            clean(c.exam),
            clean(c.kind)
        ).filter { it.isNotBlank() }.joinToString("_") + ".pdf"
    }

    private fun updateFileNamePreview() {
        val school = selectedSchool() ?: run {
            binding.fileNamePreview.text = "ファイル名：学校を選択してください"
            return
        }
        if (binding.exam.adapter == null || binding.exam.count == 0) return
        val c = ExamContext(
            school,
            binding.year.selectedItem?.toString() ?: "",
            binding.grade.selectedItem?.toString() ?: "",
            binding.subject.selectedItem?.toString() ?: "",
            binding.exam.selectedItem?.toString() ?: "",
            binding.kind.selectedItem?.toString() ?: "",
            binding.teacher.text.toString().trim().ifBlank { "担当者" }
        )
        binding.fileNamePreview.text = "ファイル名：${buildFileName(c)}"
    }

    private fun mergeIntoLatestDb(c: ExamContext, fileName: String, fileId: String, url: String) {
        val fresh = gasGet("load")
        if (!fresh.optBoolean("ok")) error(fresh.optString("error", "DB読み込み失敗"))
        val data = fresh.optJSONObject("data") ?: JSONObject()
        val freshSchools = data.optJSONArray("schools") ?: JSONArray()
        val freshDb = data.optJSONObject("db") ?: JSONObject()

        val key = dbKey(c.school.id, c.year, c.grade, c.exam, c.subject)
        val item = freshDb.optJSONObject(key) ?: JSONObject().apply {
            put("files", JSONArray())
            put("noan", false)
            put("stu", false)
        }
        val files = item.optJSONArray("files") ?: JSONArray()
        var exists = false
        for (i in 0 until files.length()) {
            if (files.optJSONObject(i)?.optString("fileId") == fileId) exists = true
        }
        if (!exists) {
            files.put(JSONObject().apply {
                put("name", fileName)
                put("url", url)
                put("fileId", fileId)
                put("date", LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd")))
                put("kind", c.kind)
                put("isNew", true)
            })
        }
        item.put("files", files)
        item.put("hasNew", true)
        freshDb.put(key, item)

        val body = FormBody.Builder()
            .add("action", "saveFull")
            .add("pass", pass)
            .add("payload", JSONObject().apply {
                put("schools", freshSchools)
                put("db", freshDb)
            }.toString())
            .build()

        val req = Request.Builder().url(gasUrl).post(body).build()
        client.newCall(req).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val json = JSONObject(text)
            if (!json.optBoolean("ok")) error(json.optString("error", "DB保存失敗"))
        }
    }

    private fun verifyRegistration(c: ExamContext, fileId: String): Boolean {
        repeat(4) { attempt ->
            val fresh = gasGet("load")
            if (fresh.optBoolean("ok")) {
                val data = fresh.optJSONObject("data") ?: JSONObject()
                val freshDb = data.optJSONObject("db") ?: JSONObject()
                val item = freshDb.optJSONObject(dbKey(c.school.id, c.year, c.grade, c.exam, c.subject))
                val files = item?.optJSONArray("files") ?: JSONArray()
                for (i in 0 until files.length()) {
                    if (files.optJSONObject(i)?.optString("fileId") == fileId) return true
                }
            }
            if (attempt < 3) Thread.sleep(800L * (attempt + 1))
        }
        return false
    }

    private fun uploadPdf(uri: Uri, fileName: String): JSONObject {
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("スキャンPDFを読み込めませんでした")
        val encoded = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

        val body = FormBody.Builder()
            .add("action", "uploadAll")
            .add("pass", pass)
            .add("fileName", fileName)
            .add("mimeType", "application/pdf")
            .add("fileData", encoded)
            .build()

        val req = Request.Builder().url(gasUrl).post(body).build()
        client.newCall(req).execute().use { response ->
            return JSONObject(response.body?.string().orEmpty())
        }
    }

    private fun gasGet(action: String): JSONObject {
        val url = "$gasUrl?action=$action&pass=$pass&_ts=${System.currentTimeMillis()}"
        val req = Request.Builder().url(url).get().build()
        client.newCall(req).execute().use { response ->
            return JSONObject(response.body?.string().orEmpty())
        }
    }

    private fun dbKey(sid: String, year: String, grade: String, exam: String, subject: String) =
        "$sid||$year||$grade||$exam||$subject"

    private fun setSpinner(spinner: android.widget.Spinner, values: List<String>) {
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, values)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter
    }

    private fun currentNendo(): Int {
        val now = LocalDate.now()
        return if (now.monthValue <= 3) now.year - 1 else now.year
    }

    private fun setBusy(busy: Boolean, message: String) {
        binding.progress.visibility = if (busy) View.VISIBLE else View.GONE
        binding.scanButton.isEnabled = !busy
        binding.message.text = message
    }

    private fun showMessage(message: String) {
        binding.message.text = message
    }
}
