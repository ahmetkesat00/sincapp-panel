# QR menü düzenlemeleri

Müşteri ekranında başlık, sadakat kartı, arama ve ürünlerin sırası korunmuştur.

Panelde günlük ürün yönetimi öne çıkarıldı. Arama, kategori/durum/çeviri filtreleri, hızlı fiyat, ürün kopyalama, toplu görünürlük/satış durumu, sürükleyerek sıralama ve JSON yedek indirme eklendi. Tasarım ve renkler tek stüdyoda yönetilir; Ayarlar yalnızca değiştirilmiş alanlarını kaydeder.

İçe aktarma son onaya kadar yereldir. Aynı kategoride adı eşleşen ürünler varsayılan olarak atlanır; işletme ekleme veya güncelleme seçebilir. Fiyatı okunamayan ürün gizlidir ve fiyatı kontrol edilmeden görünür yapılamaz. Adres, ayarlar ve içe aktarılan kayıtlar tek transaction ile yazılır. Tek işlem sınırı 450 kategori/üründür; sınır aşılırsa hiçbir kayıt yazılmaz.

İlk kurulumun son önizlemesi gerçek ürünlerle yapılır. `/preview` sayfası veri okumaz veya kaydetmez; yetkili panelin okuduğu menü verisini iframe mesajıyla gösterir. Panel mesajın origin ve kaynak penceresini doğrular. Müşteri sitesinde `?onizleme=1` kapalı menüye erişim sağlamaz. Kapalı menü, bulunamayan adres ve yükleme hatası ayrı gösterilir.

Sadakat metinleri kampanyanın gerçek satın alma ve hediye adetlerini kullanır. Alerjen filtresi, hariç tutulan bütün alerjenlere aynı anda uygun seçenek bulunmasını gerektirir. Filtre kaynaklı sonuçsuz aramalar bulunamayan ürün istatistiğine yazılmaz.

## Yayına geçiş

Önce `loopygo-menu` projesinin yeni sürümü, ardından panel yayınlanmalıdır. Paneldeki yeni iframe önizlemesi menü sitesinin `/preview` sayfasına ihtiyaç duyar. Yerel test için panelin `NEXT_PUBLIC_MENU_BASE_URL` değeri yerel menü sunucusuna ayarlanabilir.

Firebase kurallarını veya dağıtım yapılandırmasını değiştiren bir işlem yapılmadı. Canlı Firestore'a deneme kaydı yazılmadı; işlev testleri kontrollü Firebase taklitleriyle, tarayıcı testleri geçici proje kopyaları ve örnek işletmeyle çalışır.

## Kontroller

- `node scripts/test-qr-menu.cjs`: fiyat, seçenek, arama, içe aktarma, atomik kayıt, alerjen ve kampanya regresyonları. Kardeş `loopygo-menu` projesinin mevcut kodunu okur.
- `node scripts/browser-check-qr-menu.cjs`: Windows'ta yerel Chromium ile geçici panel/menü kopyalarını çalıştırır. Gerçek veri yazmaz; test ekran görüntülerini `artifacts/` altında üretir.
- Her iki projede TypeScript ve değişen dosyalarda ESLint kontrolleri.
