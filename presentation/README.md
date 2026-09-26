# inscribi director sunumu

Hackathon için dokuz slaytlık, Türkçe sunum. Katılım QR'ı ilk slaytta: insanlar anlatım sürerken katılır, 5. slaytta canlı sahneye geçilir. QR doğrudan `https://live.inscribi.com` adresine gider. Konuşma metni, akış ve sorun planı: [KONUSMA.md](KONUSMA.md).

## Düzenleme

- **PowerPoint / Keynote:** [inscribi-hackathon.pptx](output/inscribi-hackathon.pptx) ilk altı slaytlık sürümdür, güncel değildir. Güncel sunum HTML ve [PDF](output/inscribi-sunum.pdf) sürümüdür. Metinler ve görseller ayrı nesnelerdir, düzenlenebilir. Konuşmacı notları süre önerileri ve kaynak açıklamalarını içerir.
- **Tarayıcı sürümü:** Slaytlar [src/make-slides.py](src/make-slides.py) ile üretilir (`python3 presentation/src/make-slides.py`), çıktısı [src/slides.json](src/slides.json). Görseller [assets](assets) klasöründedir. Düzen ve gezinme davranışı [build.mjs](build.mjs) içindedir.

HTML sürümünü yeniden oluşturmak için repo kökünden çalıştırın:

```sh
node presentation/build.mjs
```

Harici paket gerektirmez. Çıktı `presentation/output/inscribi-sunum.html` dosyasıdır. Görseller dosyaya gömülüdür, sunum internetsiz açılabilir. Canlı demo bağlantısı ve QR hedefi internet gerektirir.

PowerPoint ve HTML sürümleri bağımsızdır. HTML üretim komutu PowerPoint dosyasını değiştirmez. İki sürümün içeriğini değişikliklerden sonra eşitleyin.

## Sahnede kullanım

`output/inscribi-sunum.html` dosyasını tarayıcıda açın. Ok tuşları, boşluk veya PageUp / PageDown ile slayt değiştirin. Home / End ilk ve son slayta gider. **F** tam ekranı açar. İmleci hareket ettirince alt kontroller ve canlı sahne bağlantısı görünür.

## İçerik kaynakları

Ürün akışı bu reponun README dosyasına dayanır. Görsel ve ölçümler, `monad-hackathon` hazırlık deposundaki `docs/dogrulama/D19/sonuc.md` ve `sahne-simdi-sahnede.png` dosyalarından alınmıştır (26 Eylül 2026). Ölçüm tek oturum ve üç mobil tarayıcı bağlamına aittir, fiziksel telefon testi değildir. Ekip rolleri aynı deponun `docs/BUGUN_URUN_PLANI.md` belgesine dayanır.
