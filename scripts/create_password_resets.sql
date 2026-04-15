-- Tabla para almacenar códigos de recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_resets (
  email VARCHAR(255) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (email, code)
);
