# frozen_string_literal: true

# Dev-only helper: set a known password and toggle modern_ui_ux_enabled for screenshot capture.
# Usage: DISABLE_SPRING=1 bundle exec rails runner demo/surgimate-modernization/scripts/screenshot-setup.rb [modern|classic]

mode = ARGV[0] || 'status'
email = ENV.fetch('SCREENSHOT_USER', 'green@surgimate.com')
password = ENV.fetch('SCREENSHOT_PASSWORD', 'ScreenshotDemo1!')

user = User.find_by(email: email)
abort("User not found: #{email}") unless user

client = user.respond_to?(:client) ? user.client : user.try(:clients)&.first
abort("No client for #{email}") unless client

setting_val = client.setting_values.find_by(var: 'modern_ui_ux_enabled')
modern_enabled = setting_val&.value == true || client.settings['modernUiUxEnabled'] == true

case mode
when 'status'
  puts "email=#{email}"
  puts "client=#{client.name} (#{client.id})"
  puts "modern_ui_ux_enabled=#{modern_enabled}"
when 'modern'
  client.settings['modern_ui_ux_enabled'] = true
  puts "modern_ui_ux_enabled=true for #{client.name}"
when 'classic'
  client.settings['modern_ui_ux_enabled'] = false
  puts "modern_ui_ux_enabled=false for #{client.name}"
when 'password'
  user.password = password
  user.password_confirmation = password
  user.save!
  puts "password set for #{email}"
else
  abort "Unknown mode: #{mode}. Use status|modern|classic|password"
end
