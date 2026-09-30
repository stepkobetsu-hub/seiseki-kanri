package jp.stepkobetsu.pastexamscanner

import android.content.ActivityNotFoundException
import android.content.Intent
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
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
import androidx.core.widget.doAfterTextChanged
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS)
        .build()
    private val gasUrl = "https://script.google.com/macros/s/AKfycbxqxQOmtwe9lfB0Pt7dKzY3mC2sSRRVG9haDTMvOvrzyQNxhOYQLMTbnxAm9Im3LlXj/exec"
    private val pass = "step123"

    private data class School(val id: String, val name: String, val examCount: Int)

    private var schools: List<School> = emptyList()
    private var scannedPdfUri: Uri? = null
    private var pending: JSONObject? = null
    private val preferences by lazy { getSharedPreferences("scanner", MODE_PRIVATE) }

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
        setBusy(false, "")
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
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        scannedPdfUri = savedInstanceState?.getString("pdfUri")?.let(Uri::parse)
        if (scannedPdfUri != null) binding.scanStatus.text = "スキャン済みPDFがあります"
        pending = preferences.getString("pending", null)?.let { JSONObject(it) }

        setupStaticSpinners()
        setupListeners()
        loadSchools()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pdfUri", scannedPdfUri?.toString())
        super.onSaveInstanceState(outState)
    }

    private fun setupStaticSpinners() {
        setSpinner(binding.grade, listOf("中1", "中2", "中3"))
        setSpinner(binding.subject, listOf("英語", "数学", "国語", "理科", "社会"))

        val current = currentNendo()
        setSpinner(binding.year, (current downTo 2000).map(Int::toString))

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

        binding.teacher.doAfterTextChanged { updateFileNamePreview() }
        binding.addHomeIcon.setOnClickListener { addHomeIcon() }
        binding.openPastExamDb.setOnClickListener {
            try {
                startActivity(Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://stepkobetsu-hub.github.io/seiseki-kanri/past_exam_db.html")))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this, "リンクを開くブラウザが見つかりません。", Toast.LENGTH_LONG).show()
            }
        }
        binding.retrySchools.setOnClickListener { loadSchools() }

        binding.scanButton.setOnClickListener {
            if (!validateMetadata()) return@setOnClickListener
            setBusy(true, "文書スキャナーを起動しています…")
            scanner.getStartScanIntent(this)
                .addOnSuccessListener { sender ->
                    scannerLauncher.launch(IntentSenderRequest.Builder(sender).build())
                }
                .addOnFailureListener { e ->
                    setBusy(false, "文書スキャナーを起動できませんでした：${e.message ?: "不明なエラー"}")
                }
        }

        binding.uploadButton.setOnClickListener {
            if (pending != null) {
                uploadAndRegister(null)
                return@setOnClickListener
            }
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
                val data = RegistrationData.requireData(payload)
                val schoolArray = data.getJSONArray("schools")
                val loaded = mutableListOf<School>()
                for (i in 0 until schoolArray.length()) {
                    val s = schoolArray.getJSONObject(i)
                    loaded += School(
                        s.optString("id"),
                        s.optString("name"),
                        s.optInt("examCount", 5).coerceIn(1, 20)
                    )
                }
                schools = loaded.filter { it.id.isNotBlank() && it.name.isNotBlank() }
                check(schools.isNotEmpty()) { "学校一覧が空です。接続先の設定を確認してください" }
                setSpinner(binding.school, schools.map { "${it.name}（年${it.examCount}回）" })
                updateExamSpinner()
                binding.retrySchools.visibility = View.GONE
                setBusy(false, pending?.let { "未完了のDB登録があります：${it.getString("fileName")}" }
                    ?: "学校一覧を読み込みました。")
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                binding.retrySchools.visibility = View.VISIBLE
                setBusy(false, "学校一覧の読み込みに失敗しました：${e.message}")
            }
        }
    }

    private fun updateExamSpinner() {
        val school = selectedSchool() ?: return
        setSpinner(binding.exam, (1..school.examCount).map { "第${it}回" })
        updateFileNamePreview()
    }

    private fun uploadAndRegister(uri: Uri?) {
        lifecycleScope.launch {
            binding.uploadButton.isEnabled = false
            setBusy(true, "PDFをアップロードしています…")
            try {
                val registration = pending ?: run {
                    val context = captureContext()
                    val fileName = buildFileName(context)
                    withContext(Dispatchers.IO) {
                        val upload = uploadPdf(requireNotNull(uri), fileName)
                        if (!upload.optBoolean("ok")) error(upload.optString("error", "PDF保存に失敗しました"))
                        if (upload.optString("fileId").isBlank()) error("保存したファイルIDを取得できませんでした")
                        upload.put("fileName", fileName).put("context", context.toJson()).also {
                            pending = it
                            check(preferences.edit().putString("pending", it.toString()).commit()) {
                                "再試行用の登録情報を端末へ保存できませんでした"
                            }
                        }
                    }
                }
                val context = contextFromJson(registration.getJSONObject("context"))
                val fileName = registration.getString("fileName")
                val fileId = registration.getString("fileId")
                val url = registration.optString("url")

                setBusy(true, "過去問DBへ登録しています…")
                withContext(Dispatchers.IO) {
                    mergeIntoLatestDb(context, fileName, fileId, url)
                }

                setBusy(true, "DBへの反映を確認しています…")
                val verified = withContext(Dispatchers.IO) { verifyRegistration(context, fileId) }
                if (!verified) error("PDFは保存されましたが、DBへの反映を確認できませんでした")

                check(withContext(Dispatchers.IO) { preferences.edit().remove("pending").commit() }) {
                    "登録済みですが端末の再試行情報を消去できませんでした"
                }
                pending = null
                scannedPdfUri = null
                setBusy(false, "登録完了：過去問DBへの反映を確認しました。\n$fileName")
                binding.scanStatus.text = "まだスキャンしていません"
                binding.scanStatus.setTextColor(0xFF475569.toInt())
                binding.uploadButton.isEnabled = false
                showRegistrationComplete(fileName)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                setBusy(false, "登録できませんでした：${e.message}" +
                    if (pending != null) "\nアップロード済みPDFのDB登録を再試行できます。" else "")
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

    private fun ExamContext.toJson() = JSONObject().apply {
        put("schoolId", school.id)
        put("schoolName", school.name)
        put("year", year)
        put("grade", grade)
        put("subject", subject)
        put("exam", exam)
        put("kind", kind)
        put("teacher", teacher)
    }

    private fun contextFromJson(c: JSONObject) = ExamContext(
        School(c.getString("schoolId"), c.getString("schoolName"), 5),
        c.getString("year"), c.getString("grade"), c.getString("subject"),
        c.getString("exam"), c.getString("kind"), c.getString("teacher")
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
        val data = RegistrationData.requireData(fresh)
        val freshSchools = data.getJSONArray("schools")
        val freshDb = data.getJSONObject("db")
        check((0 until freshSchools.length()).any { freshSchools.getJSONObject(it).optString("id") == c.school.id }) {
            "登録先の学校が最新DBにありません"
        }

        val key = dbKey(c.school.id, c.year, c.grade, c.exam, c.subject)
        if (RegistrationData.contains(freshDb, key, fileId)) return
        RegistrationData.merge(freshDb, key, JSONObject().apply {
                put("name", fileName)
                put("url", url)
                put("fileId", fileId)
                put("date", LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd")))
                put("kind", c.kind)
                put("isNew", true)
        })

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
            val json = readResponse(response)
            if (!json.optBoolean("ok")) error(json.optString("error", "DB保存失敗"))
        }
    }

    private fun verifyRegistration(c: ExamContext, fileId: String): Boolean {
        repeat(4) { attempt ->
            val fresh = gasGet("load")
            if (fresh.optBoolean("ok")) {
                val freshDb = RegistrationData.requireData(fresh).getJSONObject("db")
                if (RegistrationData.contains(freshDb, dbKey(c.school.id, c.year, c.grade, c.exam, c.subject), fileId)) return true
            }
            if (attempt < 3) Thread.sleep(800L * (attempt + 1))
        }
        return false
    }

    private fun uploadPdf(uri: Uri, fileName: String): JSONObject {
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("スキャンPDFを読み込めませんでした")
        check(bytes.size >= 5 && bytes.take(5).toByteArray().toString(Charsets.US_ASCII) == "%PDF-") {
            "スキャン結果が有効なPDFではありません"
        }
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
            return readResponse(response)
        }
    }

    private fun gasGet(action: String): JSONObject {
        val url = "$gasUrl?action=$action&pass=$pass&_ts=${System.currentTimeMillis()}"
        val req = Request.Builder().url(url).get().build()
        client.newCall(req).execute().use { response ->
            return readResponse(response)
        }
    }

    private fun readResponse(response: okhttp3.Response): JSONObject {
        check(response.isSuccessful) { "通信に失敗しました（HTTP ${response.code}）" }
        return try {
            JSONObject(response.body?.string().orEmpty())
        } catch (e: org.json.JSONException) {
            error("サーバーからJSON以外の応答が返りました。接続先と公開設定を確認してください")
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
        if (busy) binding.completionCard.visibility = View.GONE
        binding.progress.visibility = if (busy) View.VISIBLE else View.GONE
        binding.scanButton.isEnabled = !busy && schools.isNotEmpty() && pending == null
        binding.uploadButton.isEnabled = !busy && (pending != null || (scannedPdfUri != null && schools.isNotEmpty()))
        binding.uploadButton.text = if (pending != null) "DB登録を再試行" else "② 過去問DBへ登録"
        binding.retrySchools.isEnabled = !busy
        listOf(binding.teacher, binding.school, binding.grade, binding.subject, binding.year, binding.exam, binding.kind)
            .forEach { it.isEnabled = !busy && pending == null }
        binding.message.text = message
    }

    private fun showRegistrationComplete(fileName: String) {
        binding.completionDetails.text = "過去問DBへの反映を確認しました。\n$fileName"
        binding.completionCard.visibility = View.VISIBLE
        binding.root.post { binding.root.smoothScrollTo(0, 0) }
        val title = TextView(this).apply {
            text = "✓ 登録完了"
            textSize = 30f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(0xFF166534.toInt())
            val padding = (24 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding / 2)
        }
        AlertDialog.Builder(this)
            .setCustomTitle(title)
            .setMessage("過去問DBへの反映を確認しました。\n\n$fileName")
            .setPositiveButton("確認しました", null)
            .show()
    }

    private fun addHomeIcon() {
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(this)) {
            AlertDialog.Builder(this)
                .setTitle("ホーム画面にアイコンを追加")
                .setMessage("アプリ一覧で「STEP過去問スキャナー」を長押しし、ホーム画面へ移動してください。")
                .setPositiveButton("閉じる", null)
                .show()
            return
        }
        val shortcut = ShortcutInfoCompat.Builder(this, "step-past-exam-scanner")
            .setShortLabel("STEP過去問")
            .setLongLabel("STEP過去問スキャナー")
            .setIcon(IconCompat.createWithResource(this, R.drawable.ic_scanner))
            .setIntent(Intent(this, MainActivity::class.java).setAction(Intent.ACTION_MAIN)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
            .build()
        val requested = ShortcutManagerCompat.requestPinShortcut(this, shortcut, null)
        Toast.makeText(this, if (requested) "端末の追加画面で「追加」を押してください。"
            else "アプリ一覧から長押ししてホーム画面へ移動してください。", Toast.LENGTH_LONG).show()
    }

    private fun showMessage(message: String) {
        binding.message.text = message
    }
}
