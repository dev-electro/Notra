package app.notra.contactpicker

import android.app.Activity
import android.content.Intent
import android.provider.ContactsContract
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Pick ONE phone number from the phone's own contact app, WITHOUT the READ_CONTACTS permission.
 *
 * ACTION_PICK on CommonDataKinds.Phone.CONTENT_URI opens the system contact picker (a different app). When the person taps a
 * contact, the system returns that single row's content:// URI with a temporary read grant (FLAG_GRANT_READ_URI_PERMISSION), good for
 * this URI only. We query exactly that URI for name + number and nothing else; the rest of the address book is never readable.
 * Returns { name, number } or null when the person backs out.
 */
class NotraContactPickerModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("NotraContactPicker")

    OnActivityResult { _, payload ->
      val (requestCode, resultCode, intent) = payload
      if (requestCode != RC_PICK_PHONE) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      val uri = intent?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        val resolver = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).contentResolver
        val projection = arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER
        )
        resolver.query(uri, projection, null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) {
            promise.resolve(
              mapOf(
                "name" to (cursor.getString(0) ?: ""),
                "number" to (cursor.getString(1) ?: "")
              )
            )
            return@OnActivityResult
          }
        }
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_PICK_PHONE", e.message ?: "could not read the picked contact", e)
      }
    }

    AsyncFunction("pickPhone") { promise: Promise ->
      if (pending != null) {
        promise.reject("E_PICK_IN_PROGRESS", "a contact is already being picked", null)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)
      pending = promise
      try {
        appContext.throwingActivity.startActivityForResult(intent, RC_PICK_PHONE)
      } catch (e: Exception) {
        pending = null
        promise.reject("E_NO_PICKER", e.message ?: "no contact picker on this phone", e)
      }
    }
  }

  companion object {
    private const val RC_PICK_PHONE = 7301
  }
}
