# Web POS and admin addresses

One server serves both web apps. The address decides what people see:

| Address | Who signs in | What they get |
| --- | --- | --- |
| `app.adfirm.net` (POS) | Store owners and cashiers; new owners can create an account | The POS on phone, tablet, laptop and desktop, installable to the Home Screen |
| `pos.adfirm.net` (admin) | Adfirm super admins only | The platform admin console |

Installed Android apps keep calling the API through `pos.adfirm.net` and are always treated as the POS, so no Android update is needed.

## Set up the POS address

Do these in order. Until step 3, both addresses behave exactly as before.

1. **Cloudflare DNS:** add a record named `app` pointing to the same server as `pos` (`161.97.78.97`), with the proxy (orange cloud) on.
2. **CloudPanel:** add a Reverse Proxy site for `app.adfirm.net` with the reverse proxy URL `http://127.0.0.1:4100`, the same as `pos.adfirm.net`. Issue its SSL certificate the same way as `pos.adfirm.net`. Then check that `https://app.adfirm.net/api/health` shows `"status":"ok"`.
3. **Turn on the split:** add these lines to `/home/adfirm-pos/apps/adfirm-pos/shared/.env`, then restart the app with `pm2 restart adfirm-pos --update-env`:

   ```
   ADMIN_HOSTS=pos.adfirm.net
   APP_HOSTS=app.adfirm.net
   ```

4. **Check:** `https://app.adfirm.net/api/health` should show `"surface":"app"` and `https://pos.adfirm.net/api/health` should show `"surface":"admin"`. If either shows `"all"`, the proxy is not passing the visitor's host name; check that the CloudPanel site sends `Host` (or `X-Forwarded-Host`) unchanged.

To undo the split, remove the two lines and restart. Both addresses then serve everything again.

## What store users see after the split

- Store accounts that open `pos.adfirm.net` get a screen pointing them to `app.adfirm.net`. Any sales still queued offline in that browser are synced first; if some cannot be sent, the screen asks them to sync before switching.
- Admin accounts that open `app.adfirm.net` get a screen pointing them to the admin console.

## Installing on iPhone and iPad

Open `app.adfirm.net` in Safari, tap **Share**, then **Add to Home Screen**. The sign-in screen and the **More** page show these steps on iPhone and iPad. Chrome and Edge on Android, Windows and Mac show an **Install app** button instead.

The installed app opens full screen and starts without internet once it has been opened online at least once. Sales made offline sync when the connection returns. iPhone may clear saved offline data for an app that has not been opened for several weeks, so stores should open it while online regularly.

App icons are generated from one design by `node scripts/generate-icons.mjs`.
