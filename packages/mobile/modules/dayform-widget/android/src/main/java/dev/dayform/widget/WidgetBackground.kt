package dev.dayform.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.media.ExifInterface
import android.net.Uri
import android.util.Log
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The picture the user chose for the widget's card. It is copied once into the app's private files (shrunk, rotated
 * upright, as JPEG) and drawn per widget at the size the launcher reports: cropped to fill, with the card's rounded
 * corners and a white veil on top so the dark task text stays readable whatever the picture is.
 */
internal object WidgetBackground {
  private const val TAG = "DayformWidget"
  private const val FILE_NAME = "widget_background.jpg"
  /** The longest side kept of the stored copy, and of a picture drawn into a widget (a RemoteViews bitmap counts against a memory limit). */
  private const val STORE_MAX_PX = 1280
  private const val DRAW_MAX_PX = 900
  private const val CARD_RADIUS_DP = 24f
  const val DEFAULT_VEIL = 72
  const val MAX_VEIL = 90

  private fun file(context: Context) = File(context.filesDir, FILE_NAME)

  fun exists(context: Context): Boolean = file(context).isFile

  /** Copies and shrinks the picture behind `uri` (content: or file:). False when it cannot be read as an image. */
  fun save(context: Context, uri: String): Boolean {
    val source = Uri.parse(uri)
    val resolver = context.contentResolver
    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      // Measuring only: decodeStream returns null for a bounds-only decode, so the result is not checked, the size is.
      (resolver.openInputStream(source) ?: return false).use { BitmapFactory.decodeStream(it, null, bounds) }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
      val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, STORE_MAX_PX) }
      val decoded = resolver.openInputStream(source)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return false
      val upright = rotate(decoded, orientationOf(context, source))
      val scale = STORE_MAX_PX.toFloat() / max(upright.width, upright.height)
      val stored = if (scale < 1f) {
        Bitmap.createScaledBitmap(upright, (upright.width * scale).roundToInt().coerceAtLeast(1), (upright.height * scale).roundToInt().coerceAtLeast(1), true)
      } else {
        upright
      }
      val target = file(context)
      val temp = File(target.parentFile, "$FILE_NAME.tmp")
      temp.outputStream().use { stored.compress(Bitmap.CompressFormat.JPEG, 88, it) }
      if (!temp.renameTo(target)) {
        target.delete()
        if (!temp.renameTo(target)) return false
      }
      true
    } catch (error: Exception) {
      Log.w(TAG, "The background picture cannot be used", error)
      false
    } catch (error: OutOfMemoryError) {
      Log.w(TAG, "The background picture is too large", error)
      false
    }
  }

  fun clear(context: Context) {
    file(context).delete()
  }

  /** The picture drawn for a card of `widthDp` x `heightDp`, or null when there is none (or it cannot be read). */
  fun render(context: Context, widthDp: Int, heightDp: Int, veilPercent: Int): Bitmap? {
    val stored = file(context)
    if (!stored.isFile || widthDp <= 0 || heightDp <= 0) return null
    return try {
      val density = context.resources.displayMetrics.density
      val shrink = DRAW_MAX_PX / (max(widthDp, heightDp) * density)
      val k = if (shrink < 1f) shrink else 1f
      val width = (widthDp * density * k).roundToInt().coerceAtLeast(1)
      val height = (heightDp * density * k).roundToInt().coerceAtLeast(1)
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(stored.path, bounds)
      val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, max(width, height) * 2) }
      val picture = BitmapFactory.decodeFile(stored.path, options) ?: return null
      val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(out)
      val radius = CARD_RADIUS_DP * density * k
      canvas.clipPath(Path().apply { addRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), radius, radius, Path.Direction.CW) })
      // Fill the card: scale to cover it and keep the middle of the picture.
      val cover = max(width.toFloat() / picture.width, height.toFloat() / picture.height)
      val matrix = Matrix().apply {
        postScale(cover, cover)
        postTranslate((width - picture.width * cover) / 2f, (height - picture.height * cover) / 2f)
      }
      canvas.drawBitmap(picture, matrix, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
      val veil = veilPercent.coerceIn(0, MAX_VEIL)
      if (veil > 0) canvas.drawColor(Color.argb((255 * veil / 100f).roundToInt(), 255, 255, 255))
      out
    } catch (error: Exception) {
      null
    } catch (error: OutOfMemoryError) {
      null
    }
  }

  /** The power-of-two sample size that keeps the decoded longest side at or above `target` px. */
  private fun sampleSize(width: Int, height: Int, target: Int): Int {
    var size = 1
    while (max(width, height) / (size * 2) >= target) size *= 2
    return size
  }

  private fun orientationOf(context: Context, uri: Uri): Int =
    try {
      context.contentResolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
    } catch (error: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }

  private fun rotate(bitmap: Bitmap, orientation: Int): Bitmap {
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      else -> return bitmap
    }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
  }
}
