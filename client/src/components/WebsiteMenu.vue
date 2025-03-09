<script setup lang="ts">
import { ref } from 'vue';

const d = reactive({
  email: '',
  password: '',
  error: '',
  loading: false
})

// Mobile menu state
const mobileMenuOpen = ref(false);

const toggleMobileMenu = () => {
  mobileMenuOpen.value = !mobileMenuOpen.value;
};
</script>

<template>
  <!-- Navigation Bar -->
  <nav class="navbar">
    <div class="logo">
      <h2>Auto<span>Notes</span></h2>
    </div>
    <div class="nav-toggle" @click="toggleMobileMenu">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="nav-links" :class="{ 'active': mobileMenuOpen }">
      <ul>
        <li><a href="#features">Features</a></li>
        <li><a href="#testimonials">Testimonials</a></li>
        <li><a href="/pricing">Pricing</a></li>
        <li><a href="/about">About</a></li>
      </ul>
      <div class="auth-buttons">
        <a href="/app/login" class="login-btn">Login</a>
        <a href="/app/register" class="register-btn">Start Now</a>
      </div>
    </div>
  </nav>
</template>

<style lang="scss">
@import '../scss/variables.module.scss';

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-md $spacing-lg;
  position: sticky;
  top: 0;
  background: rgba($white, 0.95);
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 15px rgba(0, 0, 0, 0.05);
  z-index: 100;
  
  .logo {
    h2 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 800;
      text-align: left;
      
      span {
        background: $primary-gradient;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
    }
  }
  
  .nav-links {
    display: flex;
    align-items: center;
    
    ul {
      display: flex;
      list-style: none;
      margin: 0;
      padding: 0;
      
      li {
        margin: 0 $spacing-md;
        
        a {
          color: $text-dark;
          text-decoration: none;
          font-weight: 500;
          transition: color 0.2s;
          
          &:hover {
            color: $primary;
          }
        }
      }
    }
    
    .auth-buttons {
      margin-left: $spacing-lg;
      display: flex;
      align-items: center;
      
      .login-btn {
        color: $primary;
        text-decoration: none;
        font-weight: 600;
        margin-right: $spacing-md;
        transition: color 0.2s;
        
        &:hover {
          color: $secondary;
        }
      }
      
      .register-btn {
        background: $primary-gradient;
        color: $white;
        padding: 0.6rem 1.2rem;
        border-radius: $border-radius-sm;
        text-decoration: none;
        font-weight: 600;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: $shadow-sm;
        
        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 15px rgba(76, 94, 207, 0.4);
        }
      }
    }
  }
  
  .nav-toggle {
    display: none;
    flex-direction: column;
    cursor: pointer;
    
    span {
      width: 25px;
      height: 3px;
      background: $primary;
      margin: 2px 0;
      border-radius: 3px;
      transition: all 0.3s ease;
    }
  }
  
  @media (max-width: $breakpoint-lg) {
    .nav-toggle {
      display: flex;
    }
    
    .nav-links {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: $white;
      flex-direction: column;
      box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
      padding: $spacing-lg;
      clip-path: circle(0px at top right);
      transition: clip-path 0.4s ease-in-out;
      
      &.active {
        clip-path: circle(1500px at top right);
      }
      
      ul {
        flex-direction: column;
        width: 100%;
        
        li {
          margin: $spacing-sm 0;
        }
      }
      
      .auth-buttons {
        margin: $spacing-md 0 0 0;
        width: 100%;
        justify-content: center;
      }
    }
  }
}
</style>