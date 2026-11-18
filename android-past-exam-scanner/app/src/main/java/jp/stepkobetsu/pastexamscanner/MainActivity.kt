package jp.stepkobetsu.pastexamscanner

import android.content.ActivityNotFoundException
import android.content.Intent
import android.widget.TextView
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
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
        binding.teacher.setText(preferences.getString("last_teacher", "").orEmpty())
        setupListeners()
        restoreSchools()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pdfUri", scannedPdfUri?.toString())
        super.onSaveInstanceState(outState)
    }

    private fun showScanHelp() {
        val bitmap = assets.open("scan_help_poster.jpg").use { stream ->
            android.graphics.BitmapFactory.decodeStream(stream)
        } ?: run {
            Toast.makeText(this, "使い方のイラストを読み込めませんでした", Toast.LENGTH_LONG).show()
            return
        }
        val density = resources.displayMetrics.density
        val padding = (8 * density).toInt()
        val guideLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(padding, 0, padding, 0)
        }
        val instruction = TextView(this).apply {
            text = "2本指で広げると拡大、つまむと縮小。拡大後は指で移動できます。"
            textSize = 13f
            setTextColor(0xFF334155.toInt())
            setPadding(padding, padding, padding, padding)
        }
        val poster = ZoomableScanGuideView(this).apply {
            setImageBitmap(bitmap)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                (resources.displayMetrics.heightPixels * 0.68f).toInt()
            )
            contentDescription = "過去問スキャンの使い方のイラスト。2本指で拡大できます"
        }
        guideLayout.addView(instruction)
        guideLayout.addView(poster)
        AlertDialog.Builder(this)
            .setTitle("使い方")
            .setView(guideLayout)
            .setPositiveButton("閉じる", null)
            .show()
    }

    private fun setupStaticSpinners() {
        setSpinner(binding.grade, listOf("中1", "中2", "中3"))
        setSpinner(binding.subject, listOf("英語", "数学", "国語", "理科", "社会"))

        val current = currentNendo()
        setYearSpinner(current)

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

        binding.teacher.doAfterTextChanged { editable ->
            preferences.edit().putString("last_teacher", editable?.toString()?.trim().orEmpty()).apply()
            updateFileNamePreview()
        }
        binding.openPastExamDb.setOnClickListener {
            try {
                startActivity(Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://stepkobetsu-hub.github.io/seiseki-kanri/past_exam_db.html")))
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(this, "リンクを開くブラウザが見つかりません。", Toast.LENGTH_LONG).show()
            }
        }
        binding.scanHelpButton.setOnClickListener { showScanHelp() }
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

    private fun showSchools(loaded: List<School>) {
        val selectedId = selectedSchool()?.id
        val selectedExam = binding.exam.selectedItemPosition
        schools = loaded
        setSpinner(binding.school, schools.map { "${it.name}（年${it.examCount}回）" })
        val index = schools.indexOfFirst { it.id == selectedId }
        if (index >= 0) binding.school.setSelection(index)
        updateExamSpinner()
        if (selectedExam in 0 until (selectedSchool()?.examCount ?: 0)) binding.exam.setSelection(selectedExam)
        binding.retrySchools.visibility = View.VISIBLE
    }

    private fun restoreSchools() {
        try {
            val bundled = assets.open("schools.json").bufferedReader().use { it.readText() }
            showSchools(SchoolCatalog.restore(preferences.getString("schools_v1", null), bundled))
            binding.schoolStatus.text = "保存済みの学校一覧（${schools.size}校）。学校が変わったときだけ更新してください。"
            setBusy(false, pending?.let { "未完了のDB登録があります：${it.getString("fileName")}" } ?: "学校一覧を表示しました。")
        } catch (e: Exception) {
            binding.retrySchools.visibility = View.VISIBLE
            setBusy(false, "学校一覧を更新してください：${e.message}")
        }
    }

    private fun loadSchools() {
        lifecycleScope.launch {
            setBusy(true, "学校一覧を更新しています…")
            try {
                val raw = withContext(Dispatchers.IO) {
                    val request = Request.Builder().url("$gasUrl?action=load&pass=$pass&_ts=${System.currentTimeMillis()}").get().build()
                    val schoolClient = client.newBuilder().callTimeout(25, TimeUnit.SECONDS).build()
                    schoolClient.newCall(request).execute().use { response ->
                        RegistrationData.requireData(readResponse(response)).getJSONArray("schools").toString()
                    }
                }
                val loaded = SchoolCatalog.parse(raw)
                preferences.edit().putString("schools_v1", raw).apply()
                showSchools(loaded)
                binding.schoolStatus.text = "学校一覧を更新しました（${schools.size}校）。次回もこの一覧を使います。"
                setBusy(false, pending?.let { "未完了のDB登録があります：${it.getString("fileName")}" } ?: "学校一覧を更新しました。")
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                setBusy(false, if (schools.isNotEmpty()) "更新できませんでした。保存済みの学校一覧で続けられます：${e.message}"
                    else "学校一覧の読み込みに失敗しました：${e.message}")
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
        year = selectedYear(),
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
            selectedYear(),
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
        val patch = RegistrationData.patch(freshDb, key, JSONObject().apply {
                put("name", fileName)
                put("url", url)
                put("fileId", fileId)
                put("date", LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd")))
                put("kind", c.kind)
                put("isNew", true)
        })

        val body = FormBody.Builder()
            .add("action", "savePatch")
            .add("pass", pass)
            .add("payload", patch.toString())
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

    private fun selectedYear(): String = binding.year.selectedItem?.toString()?.take(4).orEmpty()

    private fun setYearSpinner(current: Int) {
        val options = (current downTo 2000).map { year ->
            val relative = when (year) {
                current -> "今年度"
                current - 1 -> "昨年度"
                current - 2 -> "おととし"
                else -> null
            }
            if (relative == null) year.toString() else "${year}（${relative}）"
        }
        val adapter = object : ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, options) {
            private fun format(view: View): View {
                val labelView = view as? TextView ?: return view
                val text = labelView.text.toString()
                val marker = text.indexOf('（')
                if (marker >= 0) {
                    val styled = SpannableString(text)
                    styled.setSpan(ForegroundColorSpan(0xFFC62828.toInt()), marker, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                    labelView.text = styled
                }
                return view
            }
            override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View =
                format(super.getView(position, convertView, parent))
            override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View =
                format(super.getDropDownView(position, convertView, parent))
        }
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.year.adapter = adapter
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

    private fun showMessage(message: String) {
        binding.message.text = message
    }
}


// Native image gestures: independent of Android WebView viewport/zoom settings.
private class ZoomableScanGuideView(context: android.content.Context) :
    androidx.appcompat.widget.AppCompatImageView(context) {
    private val imageTransform = android.graphics.Matrix()
    private val visibleBounds = android.graphics.RectF()
    private var previousX = 0f
    private var previousY = 0f
    private var zoom = 1f
    private var baseWidth = 0f
    private var baseHeight = 0f
    private var dragging = false

    private val pincher = android.view.ScaleGestureDetector(
        context,
        object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {
                val nextZoom = (zoom * detector.scaleFactor).coerceIn(1f, 6f)
                val change = nextZoom / zoom
                zoom = nextZoom
                imageTransform.postScale(change, change, detector.focusX, detector.focusY)
                constrainImage()
                imageMatrix = imageTransform
                return true
            }
        }
    )

    init {
        scaleType = ScaleType.MATRIX
        setBackgroundColor(android.graphics.Color.WHITE)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        val current = drawable ?: return
        if (w <= 0 || h <= 0 || current.intrinsicWidth <= 0 || current.intrinsicHeight <= 0) return
        baseWidth = current.intrinsicWidth.toFloat()
        baseHeight = current.intrinsicHeight.toFloat()
        imageTransform.setRectToRect(
            android.graphics.RectF(0f, 0f, baseWidth, baseHeight),
            android.graphics.RectF(0f, 0f, w.toFloat(), h.toFloat()),
            android.graphics.Matrix.ScaleToFit.CENTER
        )
        zoom = 1f
        imageMatrix = imageTransform
    }

    private fun constrainImage() {
        if (baseWidth <= 0f || baseHeight <= 0f) return
        visibleBounds.set(0f, 0f, baseWidth, baseHeight)
        imageTransform.mapRect(visibleBounds)
        val dx = if (visibleBounds.width() <= width) width / 2f - visibleBounds.centerX()
                 else when {
                     visibleBounds.left > 0f -> -visibleBounds.left
                     visibleBounds.right < width -> width - visibleBounds.right
                     else -> 0f
                 }
        val dy = if (visibleBounds.height() <= height) height / 2f - visibleBounds.centerY()
                 else when {
                     visibleBounds.top > 0f -> -visibleBounds.top
                     visibleBounds.bottom < height -> height - visibleBounds.bottom
                     else -> 0f
                 }
        imageTransform.postTranslate(dx, dy)
    }

    override fun onTouchEvent(event: android.view.MotionEvent): Boolean {
        pincher.onTouchEvent(event)
        when (event.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> {
                previousX = event.x
                previousY = event.y
                dragging = true
            }
            android.view.MotionEvent.ACTION_POINTER_DOWN -> dragging = false
            android.view.MotionEvent.ACTION_POINTER_UP -> {
                dragging = false
                val remaining = if (event.actionIndex == 0) 1 else 0
                if (remaining < event.pointerCount) {
                    previousX = event.getX(remaining)
                    previousY = event.getY(remaining)
                }
            }
            android.view.MotionEvent.ACTION_MOVE -> {
                if (event.pointerCount == 1 && !pincher.isInProgress) {
                    if (dragging && zoom > 1f) {
                        imageTransform.postTranslate(event.x - previousX, event.y - previousY)
                        constrainImage()
                        imageMatrix = imageTransform
                    }
                    previousX = event.x
                    previousY = event.y
                    dragging = true
                }
            }
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                dragging = false
                performClick()
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}
