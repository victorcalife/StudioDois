import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password || password.trim().length < 6) {
  console.error('Informe uma senha com pelo menos 6 caracteres.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);