import { useContainer } from 'class-validator';
import 'reflect-metadata';
import { Container } from 'typedi';

// Initialize class-validator container
useContainer(Container);

// Add any other global test setup here
