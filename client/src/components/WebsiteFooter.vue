<script setup lang="ts">
// Component logic can be added here if needed
</script>

<template>
  <footer>
    <div class="footer-content">
      <div class="footer-logo">
        <h3>Auto<span>Notes</span></h3>
        <p>Professional therapy notes, automatically.</p>
      </div>
      
      <div class="footer-links">
        <div class="link-group">
          <h4>Product</h4>
          <a href="#features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/security">Security</a>
        </div>
        
        <div class="link-group">
          <h4>Company</h4>
          <a href="/about">About Us</a>
          <a href="/blog">Blog</a>
          <a href="/careers">Careers</a>
        </div>
        
        <div class="link-group">
          <h4>Support</h4>
          <a href="/help">Help Center</a>
          <a href="/contact">Contact Us</a>
          <a href="/demo">Request Demo</a>
        </div>
      </div>
    </div>
    
    <div class="footer-bottom">
      <p>&copy; 2023 AutoNotes. All rights reserved.</p>
      <div class="legal-links">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </div>
    </div>
  </footer>
</template>

<style lang="scss">
@import '../scss/variables.module.scss';

footer {
  background: $dark-bg;
  color: $text-light;
  padding: $spacing-xl $spacing-lg $spacing-lg;
  
  .footer-content {
    display: flex;
    justify-content: space-between;
    max-width: $breakpoint-xl;
    margin: 0 auto;
    flex-wrap: wrap;
    gap: $spacing-lg;
    
    .footer-logo {
      flex: 1;
      min-width: 250px;
      
      h3 {
        font-size: 1.5rem;
        color: $white;
        margin-bottom: $spacing-sm;
        
        span {
          background: $primary-gradient;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
      }
    }
    
    .footer-links {
      display: flex;
      gap: $spacing-xl;
      flex-wrap: wrap;
      
      .link-group {
        h4 {
          color: $white;
          font-size: 1.1rem;
          margin-bottom: $spacing-md;
        }
        
        a {
          display: block;
          color: $text-light;
          text-decoration: none;
          margin-bottom: 0.75rem;
          transition: color 0.2s;
          
          &:hover {
            color: $primary;
          }
        }
      }
    }
  }
  
  .footer-bottom {
    max-width: $breakpoint-xl;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    border-top: 1px solid $footer-border;
    padding-top: $spacing-lg;
    margin-top: $spacing-xl;
    flex-wrap: wrap;
    gap: $spacing-sm;
    
    p {
      margin: 0;
    }
    
    .legal-links {
      a {
        color: $text-light;
        text-decoration: none;
        margin-left: $spacing-md;
        
        &:hover {
          text-decoration: underline;
        }
      }
    }
    
    @media (max-width: $breakpoint-sm) {
      flex-direction: column;
      text-align: center;
      
      .legal-links a {
        margin: 0 0.75rem;
      }
    }
  }
}
</style>
