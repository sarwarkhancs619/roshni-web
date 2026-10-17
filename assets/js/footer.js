/**
 * footer.js  –  injects the shared site footer with Roshni Monogram & Social Media icons into every page.
 */
(function () {
  const html = `
  <footer class="site-footer">
    <div class="footer-grid">
      <!-- Brand with Monogram -->
      <div class="footer-brand">
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
          <img src="assets/images/roshni_logo.jpg" alt="Roshni Association Emblem" style="width:3rem;height:3rem;border-radius:50%;object-fit:cover;box-shadow:0 3px 12px rgba(0,0,0,0.2);border:2px solid rgba(255,255,255,0.4);background:#fff;">
          <div>
            <div style="font-weight:700;font-size:1.1rem;color:#fff;">Roshni Association</div>
            <div style="font-size:0.68rem;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.1em;">Welfare of Special Persons</div>
          </div>
        </div>
        <p>Society for the Welfare of Special Persons. Dedicated to community living, organic biodynamic farming, Waldorf education &amp; therapeutic craft workshops in Lahore since 1991.</p>
        
        <!-- Social Icons -->
        <div class="social-links">
          <a href="https://www.facebook.com/roshnipak" target="_blank" rel="noopener" class="social-link facebook" title="Facebook" aria-label="Facebook">
            <i class="fab fa-facebook-f"></i>
          </a>
          <a href="https://twitter.com/RoshniAssoc" target="_blank" rel="noopener" class="social-link twitter" title="Twitter / X" aria-label="Twitter">
            <i class="fab fa-twitter"></i>
          </a>
          <a href="https://www.instagram.com/roshni.association/" target="_blank" rel="noopener" class="social-link instagram" title="Instagram" aria-label="Instagram">
            <i class="fab fa-instagram"></i>
          </a>
          <a href="https://www.youtube.com/@RoshniAssociation" target="_blank" rel="noopener" class="social-link youtube" title="YouTube" aria-label="YouTube">
            <i class="fab fa-youtube"></i>
          </a>
          <a href="https://www.linkedin.com/company/roshni-association" target="_blank" rel="noopener" class="social-link linkedin" title="LinkedIn" aria-label="LinkedIn">
            <i class="fab fa-linkedin-in"></i>
          </a>
          <a href="https://wa.me/923224767808" target="_blank" rel="noopener" class="social-link whatsapp" title="WhatsApp" aria-label="WhatsApp">
            <i class="fab fa-whatsapp"></i>
          </a>
        </div>
      </div>

      <!-- Quick Links -->
      <div class="footer-col">
        <h4>Explore Pages</h4>
        <ul>
          <li><a href="index.html">Home</a></li>
          <li><a href="about.html">About Us &amp; History</a></li>
          <li><a href="projects.html">Our Initiatives &amp; CBR</a></li>
          <li><a href="volunteer.html">Volunteer With Us</a></li>
          <li><a href="shop.html">Artisanal Shop</a></li>
          <li><a href="news.html">News &amp; Media</a></li>
          <li><a href="contact.html">Contact &amp; Location</a></li>
        </ul>
      </div>

      <!-- Programs -->
      <div class="footer-col">
        <h4>Our Core Programs</h4>
        <ul>
          <li><a href="projects.html#village">Roshni Village Community</a></li>
          <li><a href="projects.html#school">Green Earth Waldorf School</a></li>
          <li><a href="projects.html#cbr">Community Based Rehab (CBR)</a></li>
          <li><a href="projects.html#bakery">Organic Stone-Oven Bakery</a></li>
          <li><a href="projects.html#farm">Biodynamic Organic Farm</a></li>
          <li><a href="projects.html#crafts">Handloom &amp; Woodwork</a></li>
          <li><a href="contact.html#donate">Sponsor a Child or Resident</a></li>
        </ul>
      </div>

      <!-- Contact -->
      <div class="footer-col">
        <h4>Get in Touch</h4>
        <address>
          <p>📍 Karbath Soling,<br>Bedian Road, Lahore,<br>Pakistan</p>
          <p style="margin-top:0.75rem;">📞 <a href="tel:+924237167791">+92 42 37167791</a></p>
          <p>📱 <a href="tel:+923224767808">+92 322 4767808</a></p>
          <p style="margin-top:0.5rem;">✉️ <a href="mailto:pr@roshni.org.pk">pr@roshni.org.pk</a></p>
        </address>
      </div>
    </div>

    <!-- Footer Bottom -->
    <div class="footer-bottom">
      <span>&copy; 2026 Roshni Association. Society for the Welfare of Special Persons. All rights reserved.</span>
      <span>
        <a href="contact.html">Contact Us</a>
      </span>
    </div>
  </footer>
  `;

  const placeholder = document.getElementById('site-footer-placeholder');
  if (placeholder) {
    placeholder.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
})();
